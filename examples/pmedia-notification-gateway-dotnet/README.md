# PMEDIA Notification Gateway - ASP.NET Core skeleton

This is a minimal backend skeleton for the PMEDIA Agent Notification Protocol.

It is intentionally in-memory first so the desktop plugin can be tested before adding PostgreSQL, multi-tenant routing, user/team permissions, and production deployment concerns.

## What this example provides

```http
GET  /health
POST /api/notifications/publish
GET  /api/agent/notifications?cursor={cursor}&limit=50
POST /api/agent/notifications/{id}/ack
POST /api/agent/notifications/{id}/dismiss
GET  /api/admin/notifications
POST /api/admin/notifications/clear
```

## Authentication

The sample accepts either:

```http
X-API-Key: {token}
```

or:

```http
Authorization: Bearer {token}
```

Development defaults:

```text
Publish API key: dev-publish-key
Agent API key:   dev-agent-key
```

The desktop plugin source should use:

```json
{
  "id": "pmedia-gateway-dev",
  "type": "notification-gateway",
  "name": "PMEDIA Gateway Dev",
  "baseUrl": "https://agent-api.pmedia.vn",
  "enabled": true,
  "authType": "api-key"
}
```

For local development, OpenPets currently blocks arbitrary localhost/private hosts through plugin network permission rules. Use a public HTTPS tunnel or deploy this gateway to a manifest-allowed host for end-to-end desktop testing.

## Run locally

```bash
cd examples/pmedia-notification-gateway-dotnet
dotnet run
```

The default local endpoint is usually:

```text
http://localhost:5000
```

or the HTTPS profile configured by your .NET SDK.

## Publish a notification

```bash
curl -X POST "http://localhost:5000/api/notifications/publish" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-publish-key" \
  -d '{
    "source": {
      "id": "crm",
      "name": "CRM",
      "module": "Leads"
    },
    "type": "lead_created",
    "severity": "warning",
    "title": "Lead mới từ website",
    "message": "Khách hàng Nguyễn Văn A vừa gửi form tư vấn.",
    "action": {
      "label": "Mở CRM",
      "url": "https://crm.pmedia.vn/leads/123"
    },
    "tags": ["crm", "lead"],
    "dedupeKey": "crm_lead_123"
  }'
```

## Read notifications as the desktop agent

```bash
curl "http://localhost:5000/api/agent/notifications?limit=50" \
  -H "X-API-Key: dev-agent-key"
```

Response shape:

```json
{
  "items": [
    {
      "id": "noti_001",
      "protocolVersion": "1.0",
      "source": {
        "id": "crm",
        "name": "CRM",
        "module": "Leads"
      },
      "type": "lead_created",
      "severity": "warning",
      "title": "Lead mới từ website",
      "message": "Khách hàng Nguyễn Văn A vừa gửi form tư vấn.",
      "action": {
        "label": "Mở CRM",
        "url": "https://crm.pmedia.vn/leads/123"
      },
      "tags": ["crm", "lead"],
      "createdAt": "2026-06-27T08:00:00+00:00",
      "dedupeKey": "crm_lead_123",
      "metadata": {}
    }
  ],
  "nextCursor": "638866368000000000"
}
```

## Acknowledge / dismiss

When the user clicks the notification action, the desktop plugin calls:

```bash
curl -X POST "http://localhost:5000/api/agent/notifications/noti_001/ack" \
  -H "X-API-Key: dev-agent-key"
```

When the user dismisses it, the plugin calls:

```bash
curl -X POST "http://localhost:5000/api/agent/notifications/noti_001/dismiss" \
  -H "X-API-Key: dev-agent-key"
```

Acknowledged or dismissed notifications are no longer returned by `/api/agent/notifications`.

## Publish format options

You can publish using the flat format:

```json
{
  "source": { "id": "attendance", "name": "App chấm công", "module": "Attendance" },
  "type": "missing_checkin",
  "severity": "warning",
  "title": "Có nhân viên chưa check-in",
  "message": "Có 5 nhân viên chưa check-in ca sáng."
}
```

or wrapped format:

```json
{
  "notification": {
    "id": "attendance_001",
    "protocolVersion": "1.0",
    "source": { "id": "attendance", "name": "App chấm công", "module": "Attendance" },
    "type": "missing_checkin",
    "severity": "warning",
    "title": "Có nhân viên chưa check-in",
    "message": "Có 5 nhân viên chưa check-in ca sáng.",
    "tags": ["attendance", "hr"],
    "createdAt": "2026-06-27T08:05:00+07:00",
    "dedupeKey": "attendance_missing_checkin_20260627_morning",
    "metadata": {
      "count": 5,
      "shift": "morning"
    }
  }
}
```

## Production TODO

Before using this in production:

```text
- Replace in-memory store with PostgreSQL.
- Add tenant/company/user/team routing.
- Add per-source publish keys.
- Add per-agent user/device token.
- Add rate limiting.
- Add audit log.
- Add HTTPS-only deployment.
- Add background cleanup for expired notifications.
- Add idempotency and dedupe index persistence.
- Add GitHub special adapter.
```
