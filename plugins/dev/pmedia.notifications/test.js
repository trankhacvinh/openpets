// Golden tests for pmedia.notifications.
import assert from "node:assert/strict";
import {
  compactSeenKeys,
  mapSeverityToRender,
  normalizeSeverity,
  notificationKey,
  renderNotification,
  sampleNotification,
  shouldShowSeverity,
  register,
} from "./index.js";

let createTestHarness;
try {
  ({ createTestHarness } = await import("@open-pets/plugin-sdk/testing"));
} catch {
  ({ createTestHarness } = await import(
    new URL("../../../packages/sdk/dist/testing.js", import.meta.url)
  ));
}

const PERMISSIONS = [
  "pet:speak",
  "pet:interact",
  "pet:reaction",
  "audio",
  "schedule",
  "storage",
  "commands",
  "status",
  "notify",
  "system:openExternal",
];

const LOCALES = {
  en: JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("./locales/en.json", import.meta.url),
      "utf8",
    ),
  ),
};

assert.equal(normalizeSeverity("WARNING"), "warning");
assert.equal(normalizeSeverity("unknown"), "info");
assert.equal(shouldShowSeverity("warning", "info"), true);
assert.equal(shouldShowSeverity("info", "warning"), false);
assert.equal(mapSeverityToRender("urgent").priority, "urgent");
assert.equal(notificationKey({ source: { id: "crm" }, type: "lead", id: "1" }), "crm:lead:1");
assert.deepEqual(compactSeenKeys(["a", "a", "b"]), ["a", "b"]);

// 1) start registers commands and status without showing anything.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
  });
  await h.start();
  assert.equal(h.calls.alerts.length, 0, "start should not show a notification");
  h.expectNoErrors();
}

// 2) test command renders a PMEDIA alert and stores a dedupe key.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { minSeverity: "info", soundEnabled: true, osNotificationEnabled: true },
    nowMs: 1_000_000,
  });
  await h.start();
  await h.runCommand("pmedia-test-notification");
  assert.equal(h.calls.alerts.length, 1, "expected one PMEDIA alert");
  h.expectBubble({
    indicator: {
      icon: "bell",
      label: "PMEDIA info",
      tone: "info",
      color: "#2563eb",
      background: "#dbeafe",
      borderColor: "#93c5fd",
    },
    tone: "info",
    priority: "normal",
  });
  h.expectStored("seenNotificationKeys", (keys) => Array.isArray(keys) && keys.length === 1);
  h.expectNoErrors();
}

// 3) severity filter blocks low-priority notifications.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { minSeverity: "warning" },
    nowMs: 2_000_000,
  });
  await h.start();
  const result = await renderNotification(h.ctx, sampleNotification("info"), { force: true });
  assert.deepEqual(result, { delivered: false, reason: "filtered" });
  assert.equal(h.calls.alerts.length, 0, "filtered notification should not show an alert");
  h.expectSpoke(/ignored/i);
  h.expectNoErrors();
}

// 4) duplicate dedupe key is ignored unless force=true.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { minSeverity: "info" },
    nowMs: 3_000_000,
  });
  await h.start();
  const notification = {
    ...sampleNotification("warning"),
    dedupeKey: "fixed-key",
  };
  const first = await renderNotification(h.ctx, notification);
  const second = await renderNotification(h.ctx, notification);
  assert.equal(first.delivered, true);
  assert.deepEqual(second, { delivered: false, reason: "duplicate" });
  assert.equal(h.calls.alerts.length, 1, "duplicate should not show a second alert");
  h.expectNoErrors();
}

// 5) warning command uses high-priority warning alert and sound.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { minSeverity: "info", soundEnabled: true },
    nowMs: 4_000_000,
  });
  await h.start();
  await h.runCommand("pmedia-test-warning");
  h.expectBubble({
    indicator: {
      icon: "alert-triangle",
      label: "PMEDIA warning",
      tone: "warning",
      color: "#d97706",
      background: "#fef3c7",
      borderColor: "#fbbf24",
    },
    tone: "warning",
    priority: "high",
  });
  assert.equal(h.calls.alerts.length, 1, "expected warning alert");
  h.expectNoErrors();
}

console.log("pmedia.notifications: all checks passed.");
