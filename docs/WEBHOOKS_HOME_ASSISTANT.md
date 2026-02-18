# Home Assistant Webhook Integration

This guide shows how to consume WoLy CNC webhook events from Home Assistant.

## 1. Create a Home Assistant webhook automation

1. In Home Assistant, create an automation with trigger type `Webhook`.
2. Choose a webhook ID (for example, `woly_host_events`).
3. Save the automation.

Home Assistant will expose a URL similar to:

- `https://<your-ha-host>/api/webhook/woly_host_events`

## 2. Register the webhook in WoLy CNC

Use the CNC API endpoint:

```bash
curl -X POST "http://localhost:8080/api/webhooks" \
  -H "Authorization: Bearer <operator-or-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-ha-host>/api/webhook/woly_host_events",
    "events": ["host.awake", "host.asleep", "node.disconnected"],
    "secret": "replace-with-shared-secret"
  }'
```

## 3. Verify the HMAC signature in Home Assistant (optional, recommended)

WoLy includes `X-Woly-Signature` when `secret` is configured.

- Algorithm: `HMAC-SHA256`
- Format: `sha256=<hex-digest>`
- Signed content: raw JSON request body

In Home Assistant automation actions, add a condition/script that recalculates HMAC with the same secret and compares the header.

## 4. Event payload format

Every delivery uses this envelope:

```json
{
  "event": "host.awake",
  "timestamp": "2026-02-18T20:00:00.000Z",
  "data": {
    "hostFqn": "workstation@Home-node-1",
    "oldStatus": "asleep",
    "newStatus": "awake",
    "changedAt": "2026-02-18T20:00:00.000Z"
  }
}
```

Possible event values:

- `host.awake`
- `host.asleep`
- `host.discovered`
- `host.removed`
- `scan.complete`
- `node.connected`
- `node.disconnected`

## 5. Debug delivery attempts

Use delivery logs endpoint:

```bash
curl -X GET "http://localhost:8080/api/webhooks/<id>/deliveries?limit=50" \
  -H "Authorization: Bearer <operator-or-admin-jwt>"
```

The response includes attempt number, status, response code, and error (if any).
