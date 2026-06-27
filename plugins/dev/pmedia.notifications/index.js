// PMEDIA Notifications (pmedia.notifications)
//
// Phase 1: local renderer + mock notification commands for the PMEDIA common
// notification envelope. API source polling and the gateway connector will be
// added after this plugin shape is validated locally.

export const SEVERITY_ORDER = {
  info: 10,
  success: 20,
  warning: 30,
  error: 40,
  urgent: 50,
};

export const MAX_SEEN_KEYS = 250;

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

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await ctx.status.set({ text: ctx.t("status.ready"), tone: "info" });

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
    async stop() {},
  });
}
