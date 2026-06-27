# GitHub special adapter

The PMEDIA Notification Gateway includes a GitHub webhook adapter.

Endpoint:

```http
POST /api/adapters/github/webhook
```

This endpoint receives GitHub webhook events, verifies `X-Hub-Signature-256`, converts supported GitHub events into the common PMEDIA `AgentNotification` envelope, and stores the result in the same gateway queue consumed by the desktop pet.

## Supported events

```text
pull_request
workflow_run
check_run
ping
```

`ping` is accepted for GitHub webhook setup verification and does not publish a notification.

## Event mapping

### pull_request

Creates one notification for pull request events.

Examples:

```text
opened             -> info
reopened           -> info
synchronize        -> info
ready_for_review   -> warning
review_requested   -> warning
closed + merged    -> success
closed             -> info
```

Notification example:

```json
{
  "source": {
    "id": "github",
    "name": "GitHub",
    "module": "Pull Requests"
  },
  "type": "github_pull_request_opened",
  "severity": "info",
  "title": "PR #12 Opened: Add attendance export",
  "message": "nam opened pull request #12 in pmedia/attendance.",
  "action": {
    "label": "Open PR",
    "url": "https://github.com/pmedia/attendance/pull/12"
  },
  "tags": ["github", "pull-request", "pmedia/attendance"]
}
```

### workflow_run

Only completed workflow runs are mapped.

```text
conclusion=success -> success
other conclusions  -> error
```

### check_run

Only completed non-success check runs are mapped.

```text
conclusion!=success -> error
```

## Configure GitHub webhook

In the GitHub repository:

```text
Settings -> Webhooks -> Add webhook
```

Use:

```text
Payload URL: https://agent-api.pmedia.vn/api/adapters/github/webhook
Content type: application/json
Secret: same value as GitHub:WebhookSecret
Events: Pull requests, Workflow runs, Check runs
```

Development default secret:

```text
dev-github-webhook-secret
```

Configure production through environment/configuration, for example:

```bash
GitHub__WebhookSecret="your-production-secret"
```

## Signature verification

The adapter validates:

```http
X-Hub-Signature-256: sha256={hmac_sha256_body_signature}
```

If `GitHub:WebhookSecret` is empty, verification is skipped. Production should always use a secret.

## Test with GitHub ping

After creating the webhook, GitHub will send a `ping` event. The gateway should return:

```json
{
  "eventName": "ping",
  "deliveryId": "...",
  "published": 0,
  "results": []
}
```

## Read notifications from the desktop agent

The desktop pet still reads from the same generic endpoint:

```http
GET /api/agent/notifications?cursor={cursor}&limit=50
```

That is the key point of the adapter: GitHub-specific events are converted at the gateway edge, while the desktop pet only consumes the common notification envelope.

## Production TODO

```text
- Route notifications to specific users/teams by repo ownership or reviewer mapping.
- Add repository allowlist.
- Add organization allowlist.
- Add per-repo severity rules.
- Add ignored event/action rules.
- Persist delivery IDs for idempotency.
- Support installation-level GitHub App auth if deeper GitHub API calls are needed later.
```
