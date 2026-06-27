# PMEDIA Notifications

Development plugin for PMEDIA Agent Pet.

This plugin is the first implementation step for the PMEDIA Agent Notification Protocol. It does not connect to real backend APIs yet. It proves the common notification envelope and renders sample notifications through the desktop pet.

## Current features

- Registers a `Test PMEDIA notification` command.
- Registers a `Test warning notification` command.
- Renders notifications using the common PMEDIA envelope.
- Maps severity to pet alert tone, reaction, sound, and priority.
- Supports local deduplication using `dedupeKey`.
- Stores recently shown notification keys in plugin storage.
- Supports a minimum severity config.

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

## Next phase

- Add a source configuration panel.
- Add multiple direct generic API sources.
- Add PMEDIA Notification Gateway source.
- Add polling and ack/dismiss API calls.
- Add GitHub as a special adapter.
