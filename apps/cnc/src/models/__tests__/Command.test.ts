import db from '../../database/connection';
import { CommandModel } from '../Command';

describe('CommandModel', () => {
  beforeAll(async () => {
    await db.connect();
    await db.query('DELETE FROM commands');
    await db.query('DELETE FROM nodes');
    await db.query(
      `INSERT INTO nodes (id, name, location, status, last_heartbeat, capabilities, metadata)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6)`,
      ['node-1', 'Node 1', 'Test', 'online', '[]', '{}']
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('enqueues and returns an existing command when idempotency key matches', async () => {
    const first = await CommandModel.enqueue({
      id: 'cmd-1',
      nodeId: 'node-1',
      type: 'wake',
      payload: { type: 'wake', commandId: 'cmd-1', data: { hostName: 'h', mac: 'm' } },
      idempotencyKey: 'idem-1',
    });

    const second = await CommandModel.enqueue({
      id: 'cmd-2',
      nodeId: 'node-1',
      type: 'wake',
      payload: { type: 'wake', commandId: 'cmd-2', data: { hostName: 'h', mac: 'm' } },
      idempotencyKey: 'idem-1',
    });

    expect(second.id).toBe(first.id);
    expect(second.idempotencyKey).toBe('idem-1');
  });

  it('reconciles stale queued commands as timed_out', async () => {
    await CommandModel.enqueue({
      id: 'cmd-stale',
      nodeId: 'node-1',
      type: 'scan',
      payload: { type: 'scan', commandId: 'cmd-stale', data: { immediate: true } },
      idempotencyKey: null,
    });

    // Make it stale: set created_at far in the past.
    // Use SQLite datetime format (space-separated) to test the reconciliation logic
    await db.query(`UPDATE commands SET created_at = '2000-01-01 00:00:00' WHERE id = $1`, ['cmd-stale']);

    const count = await CommandModel.reconcileStaleInFlight(1000);
    expect(count).toBeGreaterThanOrEqual(1);

    const record = await CommandModel.findById('cmd-stale');
    expect(record?.state).toBe('timed_out');
  });
});

