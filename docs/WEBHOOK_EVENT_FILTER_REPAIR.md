# Webhook Event Filter Repair

Webhook registrations should only store supported event filters:

- `host.awake`
- `host.asleep`
- `host.discovered`
- `host.removed`
- `scan.complete`
- `node.connected`
- `node.disconnected`

New registrations are validated at the API boundary. Invalid or duplicate event
filters should receive a `400` response with validation details and the supported
event list.

## Existing Rows

Older rows may contain malformed JSON or unsupported event names. Repair those
rows before relying on webhook delivery routing.

For PostgreSQL, inspect suspicious rows with:

```sql
SELECT id, events
FROM webhooks
WHERE jsonb_typeof(events) <> 'array'
   OR EXISTS (
     SELECT 1
     FROM jsonb_array_elements_text(events) AS event(value)
     WHERE event.value NOT IN (
       'host.awake',
       'host.asleep',
       'host.discovered',
       'host.removed',
       'scan.complete',
       'node.connected',
       'node.disconnected'
     )
   );
```

For SQLite, inspect rows whose `events` field is not a valid JSON array or whose
array includes values outside the supported list. Then either update the row to
the intended supported event list or delete and recreate the webhook through the
API.

Example repair:

```sql
UPDATE webhooks
SET events = '["host.awake","host.asleep"]',
    updated_at = CURRENT_TIMESTAMP
WHERE id = '<webhook-id>';
```

Keep a copy of the original row before changing production data.
