# PMEDIA Agent Pet MVP Roadmap

## Goal

Customize the OpenPets fork into **PMEDIA Agent Pet**: a desktop companion that receives important business notifications and shows them as pet bubbles, alerts, sounds, and quick actions.

The first version should avoid deep Electron/core changes. Build a standalone plugin first, then connect it to PMEDIA backend services.

## Current repository baseline

OpenPets already provides:

- Electron desktop pet app.
- Plugin SDK v3.
- Sandboxed JavaScript plugin runtime.
- Permission-gated APIs for pet speech/reaction, UI bubbles, OS notifications, audio, schedules, storage, commands, restricted network fetch, and opening external URLs.
- Local development mode for loading plugin folders.

## MVP principles

1. Do not rewrite the desktop app from scratch.
2. Do not modify core Electron runtime until the plugin approach is proven.
3. Start with manual/test notifications.
4. Add backend polling or SSE after the plugin UI is stable.
5. Keep permissions minimal.
6. Do not request clipboard, microphone, file, or system permissions in the MVP.
7. Do not hardcode API tokens in source code.

## Proposed plugin

Plugin id:

```text
pmedia.notifications
```

Development location:

```text
plugins/dev/pmedia.notifications/
```

Current files:

```text
plugins/dev/pmedia.notifications/
  openpets.plugin.json
  index.js
  locales/en.json
  README.md
  test.js
```

## MVP feature checklist

- [ ] Run the fork locally with `pnpm dev:desktop`.
- [ ] Run OpenPets with plugin hot-loading using `pnpm dev:desktop:plugins`.
- [x] Create plugin folder `plugins/dev/pmedia.notifications`.
- [x] Add command: `Test PMEDIA notification`.
- [x] Add command: `Test warning notification`.
- [x] Show alert bubble with title, message, severity, source, and action.
- [x] Play sound for warning/error/urgent notifications when enabled.
- [x] Show OS notification when enabled.
- [x] Store recently received notification ids in `ctx.storage` to avoid duplicates.
- [x] Add config fields for minimum severity, polling toggle, polling interval, sound, and OS notification.
- [x] Add source list config schema.
- [x] Add direct generic API source normalization.
- [x] Add Notification Gateway source type.
- [x] Add `/api/agent/notifications` polling foundation.
- [x] Add `View PMEDIA sources`, `Add demo gateway source`, and `Poll PMEDIA sources now` commands.
- [x] Add ack/dismiss API lifecycle calls.
- [x] Add credential storage using plugin secrets/auth.
- [ ] Add real source configuration panel.
- [ ] Add PMEDIA Notification Gateway backend.
- [ ] Add GitHub special adapter.
- [ ] Add attendance/check-in notification source as one generic backend.

## Notification data contract

Suggested backend payload:

```json
{
  "id": "noti_001",
  "source": "github",
  "type": "pull_request",
  "severity": "info",
  "title": "PR mới",
  "message": "Nam vừa tạo PR ở repo QuanLyChamCong",
  "actionUrl": "https://github.com/example/repo/pull/123",
  "createdAt": "2026-06-26T15:00:00Z"
}
```

The canonical protocol is now tracked in:

```text
docs/pmedia-agent-notification-protocol.md
```

## Backend API draft

```http
GET  /api/agent/notifications?cursor={cursor}&limit=50
POST /api/agent/notifications/{id}/ack
POST /api/agent/notifications/{id}/dismiss
```

Auth header mapping:

```text
authType=none     -> no auth header
authType=bearer   -> Authorization: Bearer {token}
authType=api-key  -> X-API-Key: {token}
```

Token values are stored in encrypted plugin secrets using `source-token:{sourceId}`.

Later realtime option:

```http
GET /api/agent/notifications/stream
```

Use polling before adding SSE, WebSocket, or SignalR support.

## Network limitation in current plugin approach

OpenPets plugin network permissions are manifest-driven and exact-host based. The dev plugin currently allows a small set of PMEDIA hosts:

```text
agent-api.pmedia.vn
api.pmedia.vn
pmedia.vn
chamcong.pmedia.vn
logistics.pmedia.vn
crm.pmedia.vn
```

This is enough for the first PMEDIA-owned sources. Fully arbitrary domains from the UI will require a later core change for a user-managed network allowlist.

## First integration: GitHub PR notification

Flow:

```text
GitHub Pull Request event
  -> GitHub Webhook
  -> PMEDIA Notification Gateway
  -> pmedia.notifications plugin fetches unread notifications
  -> Pet shows alert
  -> User clicks Open
  -> App opens GitHub PR URL
  -> Plugin posts ack back to the gateway
```

## Generic PMEDIA backend integration

Flow:

```text
Any PMEDIA backend implementing the common protocol
  -> Direct Generic API Source or Notification Gateway
  -> pmedia.notifications plugin
  -> Pet shows alert/bubble/sound/OS notification
  -> User opens or dismisses the alert
  -> Plugin posts ack/dismiss back to the source
```

## Security notes

- API token must be user-configured or stored using plugin secret/auth flow.
- Network calls should target controlled HTTPS domains.
- Avoid localhost/private-network assumptions for production because the OpenPets network layer is designed with SSRF/private-host restrictions.
- Use least privilege permissions.
- Keep notification payloads short; do not send sensitive personal data into pet bubbles by default.

## Implementation phases

### Phase 1: Local proof of UI

- Plugin with no backend.
- One command to trigger sample notifications.
- Validate alert, sound, OS notification, and open action behavior.

### Phase 2: Direct generic API source

- Add multiple source configuration.
- Poll `/api/agent/notifications` every 30-60 seconds.
- Deduplicate by notification id or `dedupeKey`.
- Mark read after user action or dismissal.

### Phase 3: PMEDIA Notification Gateway

- Add gateway source type.
- Add backend publish endpoint.
- Add central user/team routing and notification history.

### Phase 4: Special adapters

- Add GitHub adapter.
- Convert GitHub events to the same notification envelope.

### Phase 5: Productization

- Rebrand app name, icon, splash, default pet, default plugins.
- Package Windows/macOS/Linux installers.
- Decide whether to keep fork private/public.
