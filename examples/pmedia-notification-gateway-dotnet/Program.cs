using System.Collections.Concurrent;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddSingleton<NotificationStore>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowAnyOrigin());
});

var app = builder.Build();
app.UseCors();

var publishKeys = builder.Configuration.GetSection("PublishApiKeys").Get<string[]>() ?? ["dev-publish-key"];
var agentKeys = builder.Configuration.GetSection("AgentApiKeys").Get<string[]>() ?? ["dev-agent-key"];
var githubWebhookSecret = builder.Configuration["GitHub:WebhookSecret"] ?? "dev-github-webhook-secret";

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "PMEDIA Notification Gateway",
    utc = DateTimeOffset.UtcNow,
}));

app.MapPost("/api/notifications/publish", (HttpContext http, PublishNotificationRequest request, NotificationStore store) =>
{
    if (!HasValidApiKey(http, publishKeys)) return Results.Unauthorized();

    var notification = NotificationNormalizer.Normalize(request.Notification ?? request.ToNotification());
    var result = store.Publish(notification);
    return Results.Ok(new PublishNotificationResponse(result.Id, result.Created, result.Deduped));
});

app.MapGitHubAdapterEndpoints(githubWebhookSecret);

app.MapGet("/api/agent/notifications", (HttpContext http, NotificationStore store, string? cursor, int? limit) =>
{
    if (!HasValidApiKey(http, agentKeys)) return Results.Unauthorized();

    var page = store.GetUnread(cursor, Math.Clamp(limit ?? 50, 1, 100));
    return Results.Ok(page);
});

app.MapPost("/api/agent/notifications/{id}/ack", (HttpContext http, NotificationStore store, string id) =>
{
    if (!HasValidApiKey(http, agentKeys)) return Results.Unauthorized();
    return store.Ack(id) ? Results.NoContent() : Results.NotFound();
});

app.MapPost("/api/agent/notifications/{id}/dismiss", (HttpContext http, NotificationStore store, string id) =>
{
    if (!HasValidApiKey(http, agentKeys)) return Results.Unauthorized();
    return store.Dismiss(id) ? Results.NoContent() : Results.NotFound();
});

app.MapGet("/api/admin/notifications", (HttpContext http, NotificationStore store) =>
{
    if (!HasValidApiKey(http, publishKeys)) return Results.Unauthorized();
    return Results.Ok(store.GetAll());
});

app.MapPost("/api/admin/notifications/clear", (HttpContext http, NotificationStore store) =>
{
    if (!HasValidApiKey(http, publishKeys)) return Results.Unauthorized();
    store.Clear();
    return Results.NoContent();
});

app.Run();

static bool HasValidApiKey(HttpContext http, IReadOnlyCollection<string> allowedKeys)
{
    if (allowedKeys.Count == 0) return true;

    var apiKey = http.Request.Headers["X-API-Key"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(apiKey) && allowedKeys.Contains(apiKey)) return true;

    var authorization = http.Request.Headers.Authorization.FirstOrDefault();
    const string bearerPrefix = "Bearer ";
    if (!string.IsNullOrWhiteSpace(authorization) && authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
    {
        var token = authorization[bearerPrefix.Length..].Trim();
        return allowedKeys.Contains(token);
    }

    return false;
}

public sealed class NotificationStore
{
    private readonly ConcurrentDictionary<string, StoredNotification> _items = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _dedupeIndex = new(StringComparer.OrdinalIgnoreCase);

    public PublishResult Publish(AgentNotification notification)
    {
        var dedupeKey = notification.DedupeKey?.Trim();
        if (!string.IsNullOrWhiteSpace(dedupeKey) && _dedupeIndex.TryGetValue(dedupeKey, out var existingId))
        {
            return new PublishResult(existingId, Created: false, Deduped: true);
        }

        var id = string.IsNullOrWhiteSpace(notification.Id) ? $"noti_{Guid.NewGuid():N}" : notification.Id.Trim();
        var normalized = notification with { Id = id };
        var stored = new StoredNotification(normalized, Acknowledged: false, Dismissed: false);
        _items[id] = stored;

        if (!string.IsNullOrWhiteSpace(dedupeKey)) _dedupeIndex[dedupeKey] = id;
        return new PublishResult(id, Created: true, Deduped: false);
    }

    public NotificationEnvelope GetUnread(string? cursor, int limit)
    {
        var cursorTicks = long.TryParse(cursor, out var parsed) ? parsed : 0L;
        var now = DateTimeOffset.UtcNow;
        var query = _items.Values
            .Where(item => !item.Acknowledged && !item.Dismissed)
            .Where(item => item.Notification.ExpiresAt is null || item.Notification.ExpiresAt > now)
            .Where(item => item.Notification.CreatedAt.UtcTicks > cursorTicks)
            .OrderBy(item => item.Notification.CreatedAt)
            .Take(limit)
            .Select(item => item.Notification)
            .ToList();

        var nextCursor = query.Count == 0 ? null : query.Max(item => item.CreatedAt.UtcTicks).ToString();
        return new NotificationEnvelope(query, nextCursor);
    }

    public IReadOnlyCollection<StoredNotification> GetAll() => _items.Values.OrderByDescending(item => item.Notification.CreatedAt).ToList();

    public bool Ack(string id) => UpdateState(id, acknowledged: true, dismissed: false);

    public bool Dismiss(string id) => UpdateState(id, acknowledged: false, dismissed: true);

    public void Clear()
    {
        _items.Clear();
        _dedupeIndex.Clear();
    }

    private bool UpdateState(string id, bool acknowledged, bool dismissed)
    {
        if (!_items.TryGetValue(id, out var existing)) return false;
        _items[id] = existing with
        {
            Acknowledged = existing.Acknowledged || acknowledged,
            Dismissed = existing.Dismissed || dismissed,
        };
        return true;
    }
}

public static class NotificationNormalizer
{
    private static readonly HashSet<string> AllowedSeverity = new(StringComparer.OrdinalIgnoreCase)
    {
        "info",
        "success",
        "warning",
        "error",
        "urgent",
    };

    public static AgentNotification Normalize(AgentNotification input)
    {
        var source = input.Source ?? new NotificationSource("unknown", "Unknown", null);
        var severity = AllowedSeverity.Contains(input.Severity ?? "") ? input.Severity!.ToLowerInvariant() : "info";
        var createdAt = input.CreatedAt == default ? DateTimeOffset.UtcNow : input.CreatedAt;

        return input with
        {
            Id = input.Id?.Trim() ?? "",
            ProtocolVersion = string.IsNullOrWhiteSpace(input.ProtocolVersion) ? "1.0" : input.ProtocolVersion,
            Source = source with
            {
                Id = string.IsNullOrWhiteSpace(source.Id) ? "unknown" : source.Id.Trim(),
                Name = string.IsNullOrWhiteSpace(source.Name) ? source.Id.Trim() : source.Name.Trim(),
            },
            Type = string.IsNullOrWhiteSpace(input.Type) ? "notification" : input.Type.Trim(),
            Severity = severity,
            Title = string.IsNullOrWhiteSpace(input.Title) ? "PMEDIA notification" : input.Title.Trim(),
            Message = string.IsNullOrWhiteSpace(input.Message) ? input.Title?.Trim() ?? "PMEDIA notification" : input.Message.Trim(),
            Tags = input.Tags ?? [],
            CreatedAt = createdAt,
            Metadata = input.Metadata ?? new Dictionary<string, object?>(),
        };
    }
}

public sealed record PublishNotificationRequest(
    AgentNotification? Notification,
    string? Id,
    NotificationSource? Source,
    string? Type,
    string? Severity,
    string? Title,
    string? Message,
    string? Summary,
    NotificationAction? Action,
    string[]? Tags,
    DateTimeOffset? CreatedAt,
    DateTimeOffset? ExpiresAt,
    string? DedupeKey,
    Dictionary<string, object?>? Metadata)
{
    public AgentNotification ToNotification() => new(
        Id ?? "",
        "1.0",
        Source ?? new NotificationSource("unknown", "Unknown", null),
        Type ?? "notification",
        Severity ?? "info",
        Title ?? "PMEDIA notification",
        Message ?? Title ?? "PMEDIA notification",
        Summary,
        Action,
        Tags ?? [],
        CreatedAt ?? DateTimeOffset.UtcNow,
        ExpiresAt,
        DedupeKey,
        Metadata ?? new Dictionary<string, object?>());
}

public sealed record NotificationEnvelope(IReadOnlyCollection<AgentNotification> Items, string? NextCursor);

public sealed record PublishNotificationResponse(string Id, bool Created, bool Deduped);

public sealed record PublishResult(string Id, bool Created, bool Deduped);

public sealed record StoredNotification(AgentNotification Notification, bool Acknowledged, bool Dismissed);

public sealed record AgentNotification(
    string Id,
    string ProtocolVersion,
    NotificationSource Source,
    string Type,
    string Severity,
    string Title,
    string Message,
    string? Summary,
    NotificationAction? Action,
    string[] Tags,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt,
    string? DedupeKey,
    Dictionary<string, object?> Metadata);

public sealed record NotificationSource(string Id, string Name, string? Module);

public sealed record NotificationAction(string Label, string Url);
