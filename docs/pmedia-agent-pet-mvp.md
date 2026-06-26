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

Suggested location during development:

```text
plugins/dev/pmedia.notifications/
```

Suggested files:

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
- [ ] Create plugin folder `plugins/dev/pmedia.notifications`.
- [ ] Add command: `Test PMEDIA notification`.
- [ ] Show alert bubble with title, message, severity, source, and action.
- [ ] Play sound for warning/error notifications.
- [ ] Show OS notification when enabled.
- [ ] Store recently received notification ids in `ctx.storage` to avoid duplicates.
- [ ] Add config fields for API base URL, polling interval, and notification toggles.
- [ ] Connect to PMEDIA Notification Gateway via HTTPS API.
- [ ] Add GitHub Pull Request notification source.
- [ ] Add attendance/check-in notification source.

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

Suggested severity values:

```text
info
success
warning
error
urgent
```

## Backend API draft

```http
GET  /api/agent-pet/notifications/unread
POST /api/agent-pet/notifications/{id}/read
```

Later realtime option:

```http
GET /api/agent-pet/notifications/stream
```

Use SSE/chunked streaming before adding WebSocket/SignalR support inside the desktop runtime.

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
```

## Second integration: attendance notification

Flow:

```text
Attendance scheduler detects missing check-in/check-out
  -> PMEDIA Notification Gateway stores notification
  -> Desktop pet receives it
  -> HR/admin opens attendance dashboard from the pet bubble
```

## Security notes

- API token must be user-configured or stored using plugin secret/auth flow later.
- Network calls should target a controlled HTTPS domain.
- Avoid localhost/private-network assumptions for production because the OpenPets network layer is designed with SSRF/private-host restrictions.
- Use least privilege permissions.
- Keep notification payloads short; do not send sensitive personal data into pet bubbles by default.

## Implementation phases

### Phase 1: Local proof of UI

- Plugin with no backend.
- One command to trigger sample notifications.
- Validate alert, sound, OS notification, and open action behavior.

### Phase 2: Polling backend

- Poll `/notifications/unread` every 30-60 seconds.
- Deduplicate by notification id.
- Mark read after user action or dismissal.

### Phase 3: GitHub PR source

- Backend receives GitHub webhook.
- Map PR events to notification payloads.
- Route notifications by user/team/repo.

### Phase 4: Attendance source

- Backend scheduled job checks attendance rules.
- Send HR/admin notifications only when action is needed.

### Phase 5: Productization

- Rebrand app name, icon, splash, default pet, default plugins.
- Package Windows/macOS installers.
- Decide whether to keep fork private/public.
