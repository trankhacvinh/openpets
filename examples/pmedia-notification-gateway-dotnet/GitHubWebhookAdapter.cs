using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class GitHubWebhookAdapter
{
    public static IEndpointRouteBuilder MapGitHubAdapterEndpoints(this IEndpointRouteBuilder app, string webhookSecret)
    {
        app.MapPost("/api/adapters/github/webhook", async (HttpContext http, NotificationStore store) =>
        {
            using var reader = new StreamReader(http.Request.Body, Encoding.UTF8);
            var body = await reader.ReadToEndAsync();

            if (!VerifySignature(body, webhookSecret, http.Request.Headers["X-Hub-Signature-256"].FirstOrDefault()))
            {
                return Results.Unauthorized();
            }

            var eventName = http.Request.Headers["X-GitHub-Event"].FirstOrDefault() ?? "unknown";
            var deliveryId = http.Request.Headers["X-GitHub-Delivery"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");

            if (string.Equals(eventName, "ping", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Ok(new GitHubAdapterResponse(eventName, deliveryId, 0, []));
            }

            using var document = JsonDocument.Parse(body);
            var notifications = GitHubEventMapper.Map(eventName, deliveryId, document.RootElement);
            var results = notifications
                .Select(notification => store.Publish(NotificationNormalizer.Normalize(notification)))
                .ToList();

            return Results.Ok(new GitHubAdapterResponse(eventName, deliveryId, results.Count, results));
        });

        return app;
    }

    private static bool VerifySignature(string body, string webhookSecret, string? signatureHeader)
    {
        if (string.IsNullOrWhiteSpace(webhookSecret)) return true;
        if (string.IsNullOrWhiteSpace(signatureHeader)) return false;

        const string prefix = "sha256=";
        if (!signatureHeader.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;

        var received = signatureHeader[prefix.Length..].Trim();
        var secretBytes = Encoding.UTF8.GetBytes(webhookSecret);
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        using var hmac = new HMACSHA256(secretBytes);
        var expected = Convert.ToHexString(hmac.ComputeHash(bodyBytes)).ToLowerInvariant();

        var receivedBytes = Encoding.UTF8.GetBytes(received);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        return receivedBytes.Length == expectedBytes.Length && CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes);
    }
}

public static class GitHubEventMapper
{
    public static IReadOnlyCollection<AgentNotification> Map(string eventName, string deliveryId, JsonElement payload)
    {
        return eventName.ToLowerInvariant() switch
        {
            "pull_request" => MapPullRequest(deliveryId, payload),
            "workflow_run" => MapWorkflowRun(deliveryId, payload),
            "check_run" => MapCheckRun(deliveryId, payload),
            _ => [],
        };
    }

    private static IReadOnlyCollection<AgentNotification> MapPullRequest(string deliveryId, JsonElement payload)
    {
        var action = GetString(payload, "action") ?? "unknown";
        var pr = GetObject(payload, "pull_request");
        var repo = GetObject(payload, "repository");
        var sender = GetObject(payload, "sender");

        if (pr is null || repo is null) return [];

        var number = GetInt(pr.Value, "number") ?? GetInt(payload, "number") ?? 0;
        var title = GetString(pr.Value, "title") ?? "Untitled pull request";
        var url = GetString(pr.Value, "html_url") ?? GetString(repo.Value, "html_url") ?? "https://github.com";
        var repoFullName = GetString(repo.Value, "full_name") ?? "unknown/repository";
        var senderLogin = sender is null ? "Someone" : GetString(sender.Value, "login") ?? "Someone";
        var merged = GetBool(pr.Value, "merged") == true;
        var headSha = GetNestedString(pr.Value, "head", "sha") ?? deliveryId;
        var severity = PullRequestSeverity(action, merged);
        var verb = PullRequestVerb(action, merged);

        var notification = new AgentNotification(
            Id: $"github_pr_{Slug(repoFullName)}_{number}_{Slug(action)}_{ShortHash(headSha)}",
            ProtocolVersion: "1.0",
            Source: new NotificationSource("github", "GitHub", "Pull Requests"),
            Type: $"github_pull_request_{Slug(action)}",
            Severity: severity,
            Title: $"PR #{number} {verb}: {title}",
            Message: $"{senderLogin} {verb.ToLowerInvariant()} pull request #{number} in {repoFullName}.",
            Summary: $"{repoFullName} PR #{number}",
            Action: new NotificationAction("Open PR", url),
            Tags: ["github", "pull-request", repoFullName],
            CreatedAt: DateTimeOffset.UtcNow,
            ExpiresAt: null,
            DedupeKey: $"github:{repoFullName}:pull_request:{number}:{action}:{headSha}",
            Metadata: new Dictionary<string, object?>
            {
                ["deliveryId"] = deliveryId,
                ["repo"] = repoFullName,
                ["number"] = number,
                ["action"] = action,
                ["sender"] = senderLogin,
                ["merged"] = merged,
                ["headSha"] = headSha,
            });

        return [notification];
    }

    private static IReadOnlyCollection<AgentNotification> MapWorkflowRun(string deliveryId, JsonElement payload)
    {
        var action = GetString(payload, "action") ?? "unknown";
        var run = GetObject(payload, "workflow_run");
        var repo = GetObject(payload, "repository");
        if (run is null || repo is null) return [];

        var conclusion = GetString(run.Value, "conclusion") ?? "unknown";
        var status = GetString(run.Value, "status") ?? "unknown";
        if (!string.Equals(action, "completed", StringComparison.OrdinalIgnoreCase)) return [];

        var repoFullName = GetString(repo.Value, "full_name") ?? "unknown/repository";
        var runId = GetLong(run.Value, "id")?.ToString() ?? deliveryId;
        var workflowName = GetString(run.Value, "name") ?? "GitHub workflow";
        var url = GetString(run.Value, "html_url") ?? GetString(repo.Value, "html_url") ?? "https://github.com";
        var severity = conclusion.Equals("success", StringComparison.OrdinalIgnoreCase) ? "success" : "error";

        return [new AgentNotification(
            Id: $"github_workflow_{Slug(repoFullName)}_{runId}",
            ProtocolVersion: "1.0",
            Source: new NotificationSource("github", "GitHub", "Actions"),
            Type: "github_workflow_run_completed",
            Severity: severity,
            Title: $"Workflow {conclusion}: {workflowName}",
            Message: $"Workflow {workflowName} completed with {conclusion} in {repoFullName}.",
            Summary: $"{repoFullName} workflow {conclusion}",
            Action: new NotificationAction("Open workflow", url),
            Tags: ["github", "workflow", repoFullName],
            CreatedAt: DateTimeOffset.UtcNow,
            ExpiresAt: null,
            DedupeKey: $"github:{repoFullName}:workflow_run:{runId}:{status}:{conclusion}",
            Metadata: new Dictionary<string, object?>
            {
                ["deliveryId"] = deliveryId,
                ["repo"] = repoFullName,
                ["runId"] = runId,
                ["status"] = status,
                ["conclusion"] = conclusion,
            })];
    }

    private static IReadOnlyCollection<AgentNotification> MapCheckRun(string deliveryId, JsonElement payload)
    {
        var action = GetString(payload, "action") ?? "unknown";
        var checkRun = GetObject(payload, "check_run");
        var repo = GetObject(payload, "repository");
        if (checkRun is null || repo is null) return [];
        if (!string.Equals(action, "completed", StringComparison.OrdinalIgnoreCase)) return [];

        var conclusion = GetString(checkRun.Value, "conclusion") ?? "unknown";
        if (conclusion.Equals("success", StringComparison.OrdinalIgnoreCase)) return [];

        var repoFullName = GetString(repo.Value, "full_name") ?? "unknown/repository";
        var checkRunId = GetLong(checkRun.Value, "id")?.ToString() ?? deliveryId;
        var name = GetString(checkRun.Value, "name") ?? "GitHub check";
        var url = GetString(checkRun.Value, "html_url") ?? GetString(repo.Value, "html_url") ?? "https://github.com";

        return [new AgentNotification(
            Id: $"github_check_{Slug(repoFullName)}_{checkRunId}",
            ProtocolVersion: "1.0",
            Source: new NotificationSource("github", "GitHub", "Checks"),
            Type: "github_check_run_failed",
            Severity: "error",
            Title: $"Check failed: {name}",
            Message: $"Check {name} completed with {conclusion} in {repoFullName}.",
            Summary: $"{repoFullName} check {conclusion}",
            Action: new NotificationAction("Open check", url),
            Tags: ["github", "check", repoFullName],
            CreatedAt: DateTimeOffset.UtcNow,
            ExpiresAt: null,
            DedupeKey: $"github:{repoFullName}:check_run:{checkRunId}:{conclusion}",
            Metadata: new Dictionary<string, object?>
            {
                ["deliveryId"] = deliveryId,
                ["repo"] = repoFullName,
                ["checkRunId"] = checkRunId,
                ["conclusion"] = conclusion,
            })];
    }

    private static string PullRequestSeverity(string action, bool merged)
    {
        return action.ToLowerInvariant() switch
        {
            "review_requested" => "warning",
            "ready_for_review" => "warning",
            "closed" when merged => "success",
            "closed" => "info",
            _ => "info",
        };
    }

    private static string PullRequestVerb(string action, bool merged)
    {
        return action.ToLowerInvariant() switch
        {
            "opened" => "Opened",
            "reopened" => "Reopened",
            "synchronize" => "Updated",
            "ready_for_review" => "Ready for review",
            "review_requested" => "Review requested",
            "closed" when merged => "Merged",
            "closed" => "Closed",
            _ => action.Replace('_', ' '),
        };
    }

    private static JsonElement? GetObject(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.Object ? value : null;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    private static string? GetNestedString(JsonElement element, string propertyName, string nestedPropertyName)
    {
        var obj = GetObject(element, propertyName);
        return obj is null ? null : GetString(obj.Value, nestedPropertyName);
    }

    private static int? GetInt(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.TryGetInt32(out var number) ? number : null;
    }

    private static long? GetLong(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.TryGetInt64(out var number) ? number : null;
    }

    private static bool? GetBool(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    }

    private static string Slug(string value)
    {
        var chars = value.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        return new string(chars).Trim('-');
    }

    private static string ShortHash(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "unknown" : value[..Math.Min(value.Length, 12)];
    }
}

public sealed record GitHubAdapterResponse(string EventName, string DeliveryId, int Published, IReadOnlyCollection<PublishResult> Results);
