// PMEDIA Notifications (pmedia.notifications)
//
// Phase 2 foundation: local renderer + generic source configuration and polling
// helpers for the PMEDIA common notification envelope. This plugin can poll
// manifest-allowed PMEDIA hosts. Fully arbitrary user-entered domains require a
// later core permission/allowlist change because OpenPets validates network hosts
// from the plugin manifest.

export const SEVERITY_ORDER = {
  info: 10,
  success: 20,
  warning: 30,
  error: 40,
  urgent: 50,
};

export const SOURCE_TYPES = new Set(["generic-api", "notification-gateway", "github", "custom-adapter"]);
export const AUTH_TYPES = new Set(["none", "bearer", "api-key"]);
export const MAX_SEEN_KEYS = 250;
export const MAX_SOURCES = 20;
export const POLL_TIMER_ID = "pmedia-notifications-poll";

export function normalizeSeverity(value) {
  const severity = String(value || "info").toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, severity) ? severity : "info";
}

export function severityRank(value) {
  return SEVERITY_ORDER[normalizeSeverity(value)];
}

export function shouldShowSeverity(severity, minSeverity = "info") {
  return severityRank(severity) >= severityRank(minSeverity);
}

export function cleanText(value, fallback = "") {
  return String(value || fallback)
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

export function notificationKey(notification) {
  if (notification?.dedupeKey) return String(notification.dedupeKey).slice(0, 180);
  const sourceId = notification?.source?.id || "unknown";
  const type = notification?.type || "notification";
  const id = notification?.id || `${Date.now()}`;
  return `${sourceId}:${type}:${id}`.slice(0, 180);
}

export function compactSeenKeys(keys) {
  return Array.from(new Set(Array.isArray(keys) ? keys.filter(Boolean).map(String) : [])).slice(-MAX_SEEN_KEYS);
}

export function mapSeverityToRender(severity) {
  switch (normalizeSeverity(severity)) {
    case "success":
      return {
        tone: "success",
        reaction: "success",
        icon: "check",
        labelKey: "indicator.success",
        color: "#16a34a",
        background: "#dcfce7",
        borderColor: "#86efac",
        priority: "normal",
        sound: undefined,
      };
    case "warning":
      return {
        tone: "warning",
        reaction: "thinking",
        icon: "alert-triangle",
        labelKey: "indicator.warning",
        color: "#d97706",
        background: "#fef3c7",
        borderColor: "#fbbf24",
        priority: "high",
        sound: "chime",
      };
    case "error":
      return {
        tone: "error",
        reaction: "error",
        icon: "x-circle",
        labelKey: "indicator.error",
        color: "#dc2626",
        background: "#fee2e2",
        borderColor: "#fca5a5",
        priority: "urgent",
        sound: "alert",
      };
    case "urgent":
      return {
        tone: "error",
        reaction: "error",
        icon: "siren",
        labelKey: "indicator.urgent",
        color: "#b91c1c",
        background: "#fee2e2",
        borderColor: "#ef4444",
        priority: "urgent",
        sound: "alert",
      };
    case "info":
    default:
      return {
        tone: "info",
        reaction: "waving",
        icon: "bell",
        labelKey: "indicator.info",
        color: "#2563eb",
        background: "#dbeafe",
        borderColor: "#93c5fd",
        priority: "normal",
        sound: undefined,
      };
  }
}

export function normalizeSourceConfig(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id, "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64);
  const baseUrl = cleanText(value.baseUrl, "");
  if (!id || !baseUrl) return null;

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const type = SOURCE_TYPES.has(String(value.type)) ? String(value.type) : "generic-api";
  const authType = AUTH_TYPES.has(String(value.authType)) ? String(value.authType) : "none";
  return {
    id,
    type,
    name: cleanText(value.name, id) || id,
    baseUrl: parsed.origin,
    enabled: value.enabled !== false,
    authType,
  };
}

export function normalizeSources(values) {
  return Array.from(
    new Map(
      (Array.isArray(values) ? values : [])
        .map(normalizeSourceConfig)
        .filter(Boolean)
        .slice(0, MAX_SOURCES)
        .map((source) => [source.id, source]),
    ).values(),
  );
}

export function demoGatewaySource() {
  return {
    id: "pmedia-gateway-demo",
    type: "notification-gateway",
    name: "PMEDIA Gateway Demo",
    baseUrl: "https://agent-api.pmedia.vn",
    enabled: false,
    authType: "none",
  };
}

export function normalizeNotificationEnvelope(payload, source) {
  const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  return {
    items: items
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: cleanText(item.id, `${source?.id || "source"}-${Date.now()}`),
        protocolVersion: cleanText(item.protocolVersion, "1.0"),
        source: {
          id: cleanText(item.source?.id, source?.id || "unknown"),
          name: cleanText(item.source?.name, source?.name || "PMEDIA"),
          module: cleanText(item.source?.module, ""),
        },
        type: cleanText(item.type, "notification"),
        severity: normalizeSeverity(item.severity),
        title: cleanText(item.title, "PMEDIA notification"),
        message: cleanText(item.message, item.summary || item.title || "PMEDIA notification"),
        summary: cleanText(item.summary, ""),
        action: item.action && typeof item.action === "object"
          ? {
              label: cleanText(item.action.label, "Open"),
              url: typeof item.action.url === "string" ? item.action.url : "",
            }
          : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map((tag) => cleanText(tag, "")).filter(Boolean).slice(0, 10) : [],
        createdAt: cleanText(item.createdAt, new Date().toISOString()),
        expiresAt: cleanText(item.expiresAt, ""),
        dedupeKey: cleanText(item.dedupeKey, ""),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      })),
    nextCursor: typeof payload?.nextCursor === "string" ? payload.nextCursor : null,
  };
}

export function buildNotificationsUrl(source, cursor = "") {
  const url = new URL("/api/agent/notifications", source.baseUrl);
  url.searchParams.set("limit", "50");
  if (cursor) url.searchParams.set("cursor", cursor);
  return url.toString();
}

export function sampleNotification(severity = "info") {
  const normalized = normalizeSeverity(severity);
  const isWarning = normalized === "warning";
  return {
    id: `sample-${normalized}-${Date.now().toString(36)}`,
    protocolVersion: "1.0",
    source: {
      id: "pmedia-demo",
      name: "PMEDIA Demo Source",
      module: "Agent Pet",
    },
    type: `sample_${normalized}`,
    severity: normalized,
    title: isWarning ? "Có cảnh báo cần kiểm tra" : "PMEDIA Agent Pet is ready",
    message: isWarning
      ? "Có 5 nhân viên chưa check-in ca sáng. Đây là dữ liệu mẫu để test renderer."
      : "This is a sample generic notification using the PMEDIA notification envelope.",
    action: {
      label: "Open dashboard",
      url: "https://pmedia.vn",
    },
    tags: ["pmedia", "demo"],
    createdAt: new Date().toISOString(),
    dedupeKey: `sample-${normalized}-${Date.now().toString(36)}`,
    metadata: {
      demo: true,
    },
  };
}

async function getSeenKeys(ctx) {
  return compactSeenKeys((await ctx.storage.get("seenNotificationKeys")) || []);
}

async function saveSeenKeys(ctx, keys) {
  const compacted = compactSeenKeys(keys);
  await ctx.storage.set("seenNotificationKeys", compacted);
  await ctx.status.set({ text: ctx.t("status.seen", { count: compacted.length }), tone: "info" });
  return compacted;
}

async function markSeen(ctx, key) {
  const keys = await getSeenKeys(ctx);
  if (!keys.includes(key)) keys.push(key);
  return saveSeenKeys(ctx, keys);
}

async function getStorageSources(ctx) {
  return normalizeSources((await ctx.storage.get("sources")) || []);
}

async function saveStorageSources(ctx, sources) {
  const normalized = normalizeSources(sources);
  await ctx.storage.set("sources", normalized);
  return normalized;
}

export async function getConfiguredSources(ctx) {
  const config = await ctx.config.get();
  const configSources = normalizeSources(config?.sources || []);
  const storageSources = await getStorageSources(ctx);
  return normalizeSources([...configSources, ...storageSources]);
}

async function updateSourceStatus(ctx) {
  const sources = await getConfiguredSources(ctx);
  const enabled = sources.filter((source) => source.enabled).length;
  await ctx.status.set({ text: ctx.t("status.sources", { count: sources.length, enabled }), tone: enabled ? "success" : "info" });
  return sources;
}

export async function renderNotification(ctx, notification, options = {}) {
  const config = { ...(await ctx.config.get()), ...options.config };
  const severity = normalizeSeverity(notification?.severity);
  if (!shouldShowSeverity(severity, config.minSeverity || "info")) {
    await ctx.pet.speak(ctx.t("speech.filtered"));
    return { delivered: false, reason: "filtered" };
  }

  const key = notificationKey(notification);
  const seenKeys = await getSeenKeys(ctx);
  if (seenKeys.includes(key) && !options.force) {
    return { delivered: false, reason: "duplicate" };
  }

  const title = cleanText(notification?.title, "PMEDIA notification");
  const message = cleanText(notification?.message, notification?.summary || title);
  const sourceName = cleanText(notification?.source?.name, "PMEDIA");
  const actionUrl = typeof notification?.action?.url === "string" ? notification.action.url : "";
  const actionLabel = cleanText(notification?.action?.label, ctx.t("action.open"));
  const render = mapSeverityToRender(severity);
  const soundEnabled = config.soundEnabled !== false;
  const osNotificationEnabled = config.osNotificationEnabled !== false;

  try {
    await ctx.pet.react(render.reaction, { showMessage: false });
  } catch {
    // Reaction support is best-effort; the alert is the reliable channel.
  }

  const actions = actionUrl
    ? [
        { id: "open", label: actionLabel || ctx.t("action.open"), style: "primary" },
        { id: "dismiss", label: ctx.t("action.dismiss") },
      ]
    : [{ id: "dismiss", label: ctx.t("action.dismiss") }];

  const alert = await ctx.ui.alert({
    text: `${title}\n${message}`,
    indicator: {
      icon: render.icon,
      label: ctx.t(render.labelKey),
      tone: render.tone,
      color: render.color,
      background: render.background,
      borderColor: render.borderColor,
    },
    tone: render.tone,
    priority: render.priority,
    sound: soundEnabled ? render.sound : undefined,
    notify: osNotificationEnabled
      ? {
          title: ctx.t("notify.title"),
          body: `${sourceName}: ${title}`,
        }
      : undefined,
    dismissOn: severity === "urgent" ? ["action"] : ["petClick", "click", "action"],
    actions,
  });

  alert.onAction(async (actionId) => {
    if (actionId === "open" && actionUrl) {
      try {
        await ctx.system.openExternal(actionUrl);
      } catch (err) {
        await ctx.log.warn("Failed to open PMEDIA notification action URL", err?.message || err);
      }
    }
  });

  await markSeen(ctx, key);
  return { delivered: true, key, severity };
}

export async function fetchSourceNotifications(ctx, source) {
  const cursorKey = `cursor:${source.id}`;
  const cursor = (await ctx.storage.get(cursorKey)) || "";
  const url = buildNotificationsUrl(source, cursor);
  const response = await ctx.net.fetch(url, { method: "GET", timeoutMs: 15_000 });
  if (!response.ok) {
    await ctx.log.warn("PMEDIA source returned non-OK status", source.id, response.status);
    return { source, count: 0, delivered: 0, error: `HTTP ${response.status}` };
  }

  const payload = response.json ?? JSON.parse(response.text || "{}");
  const envelope = normalizeNotificationEnvelope(payload, source);
  let delivered = 0;
  for (const notification of envelope.items) {
    const result = await renderNotification(ctx, notification);
    if (result.delivered) delivered += 1;
  }
  if (envelope.nextCursor) await ctx.storage.set(cursorKey, envelope.nextCursor);
  return { source, count: envelope.items.length, delivered, error: null };
}

export async function pollSources(ctx, options = {}) {
  const sources = (await getConfiguredSources(ctx)).filter((source) => source.enabled);
  if (!sources.length) {
    if (!options.silent) await ctx.pet.speak(ctx.t("speech.pollNoSources"));
    return { sources: 0, count: 0, delivered: 0 };
  }

  let count = 0;
  let delivered = 0;
  for (const source of sources) {
    try {
      const result = await fetchSourceNotifications(ctx, source);
      count += result.count;
      delivered += result.delivered;
    } catch (err) {
      await ctx.log.warn("Failed to poll PMEDIA source", source.id, err?.message || err);
    }
  }
  await ctx.status.set({ text: ctx.t("status.poll", { count: delivered }), tone: delivered > 0 ? "success" : "info" });
  if (!options.silent) await ctx.pet.speak(ctx.t("speech.pollComplete"));
  return { sources: sources.length, count, delivered };
}

async function schedulePolling(ctx) {
  await ctx.schedule.cancel(POLL_TIMER_ID);
  const config = await ctx.config.get();
  if (config?.pollingEnabled !== true) return;
  const intervalSeconds = Math.max(30, Math.min(3600, Math.round(Number(config.pollIntervalSeconds || 60))));
  await ctx.schedule.every(POLL_TIMER_ID, intervalSeconds * 1000, () => pollSources(ctx, { silent: true }));
}

async function showSources(ctx) {
  const sources = await updateSourceStatus(ctx);
  if (!sources.length) {
    await ctx.pet.speak(ctx.t("speech.noSources"));
    return;
  }
  const enabled = sources.filter((source) => source.enabled).length;
  const lines = sources.map((source) => `${source.enabled ? "●" : "○"} ${source.name} (${source.type})`).join("\n");
  await ctx.ui.alert({
    text: `PMEDIA sources: ${sources.length} configured, ${enabled} enabled\n${lines}`,
    indicator: {
      icon: "bell",
      label: "PMEDIA sources",
      tone: enabled ? "success" : "info",
      color: enabled ? "#16a34a" : "#2563eb",
      background: enabled ? "#dcfce7" : "#dbeafe",
      borderColor: enabled ? "#86efac" : "#93c5fd",
    },
    tone: enabled ? "success" : "info",
    actions: [{ id: "dismiss", label: ctx.t("action.dismiss") }],
  });
}

async function addDemoSource(ctx) {
  const existing = await getStorageSources(ctx);
  const next = normalizeSources([...existing.filter((source) => source.id !== "pmedia-gateway-demo"), demoGatewaySource()]);
  await saveStorageSources(ctx, next);
  await updateSourceStatus(ctx);
  await ctx.pet.speak(ctx.t("speech.sourceAdded"));
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await updateSourceStatus(ctx);
      await schedulePolling(ctx);

      await ctx.commands.register(
        {
          id: "pmedia-test-notification",
          title: "$t:command.test.title",
          description: "$t:command.test.description",
          icon: "bell",
          featured: true,
        },
        async () => renderNotification(ctx, sampleNotification("info"), { force: true }),
      );

      await ctx.commands.register(
        {
          id: "pmedia-test-warning",
          title: "$t:command.testWarning.title",
          description: "$t:command.testWarning.description",
          icon: "alert-triangle",
        },
        async () => renderNotification(ctx, sampleNotification("warning"), { force: true }),
      );

      await ctx.commands.register(
        {
          id: "pmedia-view-sources",
          title: "$t:command.viewSources.title",
          description: "$t:command.viewSources.description",
          icon: "bell",
        },
        () => showSources(ctx),
      );

      await ctx.commands.register(
        {
          id: "pmedia-add-demo-source",
          title: "$t:command.addDemoSource.title",
          description: "$t:command.addDemoSource.description",
          icon: "bell",
        },
        () => addDemoSource(ctx),
      );

      await ctx.commands.register(
        {
          id: "pmedia-poll-now",
          title: "$t:command.pollNow.title",
          description: "$t:command.pollNow.description",
          icon: "timer",
        },
        () => pollSources(ctx),
      );

      await ctx.commands.register(
        {
          id: "pmedia-clear-cache",
          title: "$t:command.clearSeen.title",
          description: "$t:command.clearSeen.description",
          icon: "trash",
        },
        async () => {
          await saveSeenKeys(ctx, []);
          await ctx.pet.speak(ctx.t("speech.cleared"));
        },
      );
    },
    async stop(ctx) {
      try {
        await ctx?.schedule?.cancel(POLL_TIMER_ID);
      } catch {
        // Host also tears schedules down; this is best-effort cleanup.
      }
    },
  });
}
