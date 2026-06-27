# PMEDIA Notifications

Development plugin for PMEDIA Agent Pet.

This plugin implements the first working slice of the PMEDIA Agent Notification Protocol. It proves the common notification envelope, renders sample notifications through the desktop pet, and now includes the foundation for multiple PMEDIA notification sources.

## Current features

- Registers a `Test PMEDIA notification` command.
- Registers a `Test warning notification` command.
- Registers `View PMEDIA sources`, `Configure PMEDIA sources`, `Add demo gateway source`, and `Poll PMEDIA sources now` commands.
- Registers `Set PMEDIA source token` and `Clear PMEDIA source token` commands.
- Ships a sandboxed `sources` panel for add/edit/delete/toggle/poll source workflows.
- Renders notifications using the common PMEDIA envelope.
- Maps severity to pet alert tone, reaction, sound, and priority.
- Supports local deduplication using `dedupeKey`.
- Stores recently shown notification keys in plugin storage.
- Stores source credentials in encrypted plugin secrets using `source-token:{sourceId}`.
- Supports minimum severity, sound, OS notification, polling toggle, polling interval, and source list config.
- Normalizes generic API / gateway source configs.
- Builds the standard `/api/agent/notifications?limit=50&cursor=...` URL.
- Normalizes notification envelope responses from direct generic API sources or the gateway.
- Calls `/api/agent/notifications/{id}/ack` when the user opens a notification action.
- Calls `/api/agent/notifications/{id}/dismiss` when the user dismisses a notification.

## Current network limitation

OpenPets validates plugin network access through exact hosts declared in `openpets.plugin.json`.

This plugin currently declares these hosts:

```text
agent-api.pmedia.vn
api.pmedia.vn
pmedia.vn
chamcong.pmedia.vn
logistics.pmedia.vn
crm.pmedia.vn
```

That means the plugin can poll those hosts after the user approves the network permission. Fully arbitrary user-entered domains will require a later core change to support a user-managed allowlist.

## Source configuration panel

Open the pet menu command:

```text
Configure PMEDIA sources
```

The panel supports:

```text
Add source
Edit panel-managed source
Enable / disable source
Delete panel-managed source
Set or replace source token
Clear source token
Poll one source
Poll all sources
```

Sources defined in the OpenPets plugin config are shown as read-only inside the panel. Panel-managed sources are stored in plugin storage.

## Source config shape

```json
{
  "id": "attendance-prod",
  "type": "generic-api",
  "name": "App chấm công",
  "baseUrl": "https://chamcong.pmedia.vn",
  "enabled": true,
  "authType": "bearer"
}
```

Supported source types:

```text
generic-api
notification-gateway
github
custom-adapter
```

Supported auth types for the schema:

```text
none
bearer
api-key
```

Token values are not stored in the source config JSON. They are stored in encrypted plugin secrets with this key format:

```text
source-token:{sourceId}
```

Use the panel token field or the command `Set PMEDIA source token` to save a token/API key for a configured source. Use `Clear PMEDIA source token` to remove it.

Auth header mapping:

```text
authType=none     -> no auth header
authType=bearer   -> Authorization: Bearer {token}
authType=api-key  -> X-API-Key: {token}
```

## Generic source API contract

Read notifications:

```http
GET /api/agent/notifications?limit=50&cursor={cursor}
```

Acknowledge after the user opens the action:

```http
POST /api/agent/notifications/{id}/ack
```

Dismiss after the user chooses Dismiss:

```http
POST /api/agent/notifications/{id}/dismiss
```

## Common notification shape

```json
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
  "action": {
    "label": "Open dashboard",
    "url": "https://example.com/dashboard"
  },
  "createdAt": "2026-06-27T08:05:00+07:00",
  "dedupeKey": "attendance_missing_checkin_20260627_morning"
}
```

## Local development

From the repo root:

```bash
pnpm install
pnpm dev:desktop:plugins
```

If the dev loader does not pick up `plugins/dev`, load this folder manually through:

```text
Plugins -> Developer Mode -> Load unpacked plugin folder
```

Select:

```text
plugins/dev/pmedia.notifications
```

## Manual testing

Use the pet menu commands:

```text
Configure PMEDIA sources
Test PMEDIA notification
Test warning notification
Add demo gateway source
View PMEDIA sources
Set PMEDIA source token
Clear PMEDIA source token
Poll PMEDIA sources now
Clear PMEDIA notification cache
```

`Add demo gateway source` adds a disabled source pointing at `https://agent-api.pmedia.vn`. Enable real sources through the configuration panel once a backend endpoint is available.

## Next phase

- Add PMEDIA Notification Gateway backend.
- Add GitHub as a special adapter.
