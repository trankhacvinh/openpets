# PMEDIA Agent Pet MVP Roadmap

## Goal

Customize the OpenPets fork into **PMEDIA Agent Pet**: a desktop companion that receives important business notifications and shows them as pet bubbles, alerts, sounds, and quick actions.

The first version should avoid deep Electron/core changes. Build a standalone plugin first, then connect it to PMEDIA backend services.

## Current plugin

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
  panels/sources.html
```

## MVP feature checklist

- [ ] Run the fork locally with `pnpm dev:desktop`.
- [ ] Run OpenPets with plugin hot-loading using `pnpm dev:desktop:plugins`.
- [x] Create plugin folder `plugins/dev/pmedia.notifications`.
- [x] Add sample notification commands.
- [x] Render notification bubble/alert/sound/OS notification.
- [x] Add dedupe storage.
- [x] Add source list config schema.
- [x] Add direct generic API source normalization.
- [x] Add Notification Gateway source type.
- [x] Add `/api/agent/notifications` polling foundation.
- [x] Add source management commands.
- [x] Add ack/dismiss lifecycle calls.
- [x] Add credential storage using plugin secrets.
- [x] Add real source configuration panel.
- [ ] Add PMEDIA Notification Gateway backend.
- [ ] Add GitHub special adapter.
- [ ] Add attendance/check-in notification source as one generic backend.

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

Secret key format:

```text
source-token:{sourceId}
```

## Source configuration panel

Open the pet menu command:

```text
Configure PMEDIA sources
```

The panel can add, edit, enable/disable, delete, set token, clear token, poll one source, and poll all sources. Sources defined in OpenPets plugin config are shown as read-only. Sources created from the panel are stored in plugin storage.

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

Fully arbitrary domains from the UI will require a later core change for a user-managed network allowlist.

## Next phases

### Phase 3: PMEDIA Notification Gateway

- Add gateway backend project or endpoint spec.
- Add backend publish endpoint.
- Add central user/team routing and notification history.

### Phase 4: Special adapters

- Add GitHub adapter.
- Convert GitHub events to the same notification envelope.

### Phase 5: Productization

- Rebrand app name, icon, splash, default pet, default plugins.
- Package Windows/macOS/Linux installers.
