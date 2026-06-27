# PMEDIA Agent Notification Protocol

## Goal

PMEDIA Agent Pet should not be built for one backend such as attendance only. It should be a generic notification client that can receive a common notification structure from many PMEDIA systems, while still allowing special adapters for external services such as GitHub.

## Architecture decision

Use both integration modes:

1. **Mode A — Direct Generic API Sources**
   - The desktop app/plugin can connect to one or more backend APIs directly.
   - Each backend implements the same notification protocol.
   - Useful for internal systems that are already deployed independently.

2. **Mode B — PMEDIA Notification Gateway**
   - All backend systems publish notifications to one central gateway.
   - The desktop app/plugin connects to the gateway as the primary source.
   - Best for production, user routing, permission control, deduplication, history, and future omni-channel delivery.

3. **Special Adapters**
   - External services with custom event shapes, OAuth flows, or webhook formats should use adapters.
   - GitHub is the first special adapter candidate.

## Recommended product model

```text
PMEDIA Agent Pet
  ├─ Generic API Sources
  │   ├─ Attendance
  │   ├─ CRM
  │   ├─ Logistics
  │   ├─ QR Traceability
  │   ├─ Website Monitor
  │   └─ Inventory / Warehouse
  │
  ├─ Notification Gateway Source
  │   └─ agent-api.pmedia.vn
  │
  ├─ Special Adapters
  │   ├─ GitHub
  │   ├─ Google Calendar
  │   ├─ Gmail
  │   └─ Zalo / OpenZCA
  │
  └─ Renderer
      ├─ Pet bubble
      ├─ Sticky alert
      ├─ Sound
      ├─ OS notification
      └─ Open action URL
```

## Why both modes are useful

### Mode A benefits

- Fast to adopt for existing PMEDIA backend systems.
- No central server dependency for early internal usage.
- Each backend team can expose a small standard endpoint.
- Good for private/internal projects or customer-specific deployments.

### Mode B benefits

- One desktop connection instead of many.
- Easier credential management.
- Easier user/team routing.
- Central deduplication and notification history.
- Better for multi-company/multi-tenant deployments.
- Better foundation for Zalo, Telegram, email, mobile push, and web dashboard later.
- Avoids asking the desktop plugin to access many arbitrary domains.

## Source types

Every configured source should have a type.

```text
generic-api
notification-gateway
github
custom-adapter
```

Suggested source config shape:

```json
{
  "id": "attendance-prod",
  "type": "generic-api",
  "name": "App chấm công",
  "baseUrl": "https://chamcong.pmedia.vn",
  "enabled": true,
  "authType": "bearer",
  "pollIntervalSeconds": 30,
  "minSeverity": "warning",
  "soundEnabled": true,
  "osNotificationEnabled": true
}
```

Credentials must not be hardcoded in source code. Store tokens/API keys using a secret store or the host's plugin credential mechanism.

## Common notification envelope

All generic PMEDIA backends and the PMEDIA Notification Gateway should return the same notification shape.

```json
{
  "items": [
    {
      "id": "noti_001",
      "protocolVersion": "1.0",
      "source": {
        "id": "attendance",
        "name": "App chấm công",
        "module": "Attendance"
      },
      "type": "missing_checkin",
      "severity": "warning",
      "title": "Có nhân viên chưa check-in",
      "message": "Có 5 nhân viên chưa check-in ca sáng.",
      "summary": "5 nhân viên chưa check-in",
      "action": {
        "label": "Mở dashboard",
        "url": "https://chamcong.pmedia.vn/admin/attendance/today"
      },
      "tags": ["attendance", "hr"],
      "createdAt": "2026-06-27T08:05:00+07:00",
      "expiresAt": "2026-06-27T12:00:00+07:00",
      "dedupeKey": "attendance_missing_checkin_20260627_morning",
      "metadata": {
        "count": 5,
        "shift": "morning"
      }
    }
  ],
  "nextCursor": null
}
```

## Required fields

```text
id
protocolVersion
source.id
source.name
type
severity
title
message
createdAt
```

## Optional but recommended fields

```text
summary
action.label
action.url
tags
expiresAt
dedupeKey
metadata
nextCursor
```

## Severity standard

```text
info      Normal information
success   Successful completion
warning   Needs attention
error     Error requiring action
urgent    Must be handled quickly
```

Suggested renderer behavior:

```text
info      -> normal bubble
success   -> success reaction
warning   -> alert bubble + light sound
error     -> sticky alert + error reaction
urgent    -> high-priority sticky alert + stronger sound + no auto-dismiss
```

## Generic backend API contract

Every direct backend source should expose:

```http
GET /api/agent/manifest
GET /api/agent/notifications?cursor={cursor}&limit=50
POST /api/agent/notifications/{id}/ack
POST /api/agent/notifications/{id}/dismiss
```

Manifest response:

```json
{
  "protocolVersion": "1.0",
  "sourceId": "attendance",
  "sourceName": "App chấm công",
  "description": "Thông báo check-in, check-out, nghỉ phép, tăng ca",
  "endpoints": {
    "notifications": "/api/agent/notifications",
    "ack": "/api/agent/notifications/{id}/ack",
    "dismiss": "/api/agent/notifications/{id}/dismiss"
  },
  "capabilities": {
    "ack": true,
    "dismiss": true,
    "cursor": true,
    "realtime": false
  }
}
```

## Notification Gateway API contract

The gateway receives notifications from multiple backend systems.

Backend publish endpoint:

```http
POST /api/notifications/publish
```

Desktop read endpoints:

```http
GET /api/agent/notifications?cursor={cursor}&limit=50
POST /api/agent/notifications/{id}/ack
POST /api/agent/notifications/{id}/dismiss
```

Future realtime endpoint:

```http
GET /api/agent/notifications/stream
```

Use polling first. Add SSE or WebSocket only after the polling flow is stable.

## GitHub special adapter

GitHub should not be forced into the generic source shape at the edge. Instead:

```text
GitHub webhook/event payload
  -> GitHub adapter
  -> PMEDIA notification envelope
  -> Agent Pet renderer
```

The adapter converts GitHub-specific events into the common envelope.

Example mapped notification:

```json
{
  "id": "github_pr_123",
  "protocolVersion": "1.0",
  "source": {
    "id": "github",
    "name": "GitHub",
    "module": "Pull Requests"
  },
  "type": "pull_request_opened",
  "severity": "info",
  "title": "PR mới",
  "message": "Nam vừa tạo PR ở repo QuanLyChamCong.",
  "action": {
    "label": "Mở PR",
    "url": "https://github.com/org/repo/pull/123"
  },
  "tags": ["github", "pull-request"],
  "createdAt": "2026-06-27T10:00:00+07:00",
  "dedupeKey": "github_org_repo_pr_123_opened"
}
```

## Desktop configuration page

The plugin/app should provide a configuration page with:

```text
Sources
  Add source
  Edit source
  Enable / disable source
  Test connection
  Test notification
  Polling interval
  Minimum severity
  Sound toggle
  OS notification toggle
  Auth type
  Token/API key
```

Recommended tabs:

```text
General
Sources
Rules
History
Adapters
Diagnostics
```

## Deduplication rules

The app should avoid showing duplicate notifications using this order:

1. `dedupeKey` when present.
2. `source.id + type + id` when no `dedupeKey` exists.
3. Store recently shown ids in plugin storage.
4. Expire local dedupe cache after a configured period.

## Security notes

- Prefer one PMEDIA Notification Gateway for production.
- Direct generic sources should be limited to trusted HTTPS domains.
- Do not show sensitive personal data in bubble text by default.
- Store credentials in a secret store, not plain config JSON.
- Do not request clipboard, microphone, or file permissions for notification MVP.
- GitHub should use its own adapter and signature verification.

## Implementation phases

### Phase 1 — Common protocol and mock renderer

- Define notification envelope.
- Add local mock source.
- Add source configuration data model.
- Show pet bubbles/alerts based on severity.

### Phase 2 — Direct generic API source

- Add multiple source configuration.
- Poll each enabled source.
- Deduplicate notifications.
- Support ack/dismiss.

### Phase 3 — Notification Gateway

- Add gateway source type.
- Add backend publish endpoint.
- Add central user/team routing.
- Store notification history.

### Phase 4 — Special adapters

- Add GitHub adapter.
- Later add Gmail, Calendar, Zalo/OpenZCA if needed.

### Phase 5 — Productization

- Rebrand UI.
- Package installers.
- Add signed releases.
- Add admin documentation for backend teams.
