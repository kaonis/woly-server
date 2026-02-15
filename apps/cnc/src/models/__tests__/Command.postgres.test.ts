type MockDb = {
  isSqlite: boolean;
  query: jest.Mock;
};

const mockDb: MockDb = {
  isSqlite: false,
  query: jest.fn(),
};

const mockLogger = {
  error: jest.fn(),
};

async function loadCommandModel() {
  jest.resetModules();
  mockDb.isSqlite = false;
  mockDb.query.mockReset();
  mockLogger.error.mockReset();

  jest.doMock('../../database/connection', () => ({
    __esModule: true,
    default: mockDb,
  }));
  jest.doMock('../../utils/logger', () => ({
    __esModule: true,
    default: mockLogger,
  }));

  const commandModule = await import('../Command');
  return commandModule.CommandModel;
}

function createRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cmd-1',
    node_id: 'node-1',
    type: 'scan',
    payload: { foo: 'bar' },
    idempotency_key: 'idem-1',
    state: 'queued',
    error: null,
    retry_count: 0,
    created_at: '2026-02-15T00:00:00.000Z',
    updated_at: '2026-02-15T00:00:01.000Z',
    sent_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe('CommandModel (PostgreSQL paths)', () => {
  afterEach(() => {
    jest.dontMock('../../database/connection');
    jest.dontMock('../../utils/logger');
  });

  it('enqueue inserts and returns mapped command record when idempotency key is not provided', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValueOnce({ rows: [createRow({ idempotency_key: null })], rowCount: 1 });

    const result = await CommandModel.enqueue({
      id: 'cmd-1',
      nodeId: 'node-1',
      type: 'scan',
      payload: { foo: 'bar' },
      idempotencyKey: null,
    });

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO commands'),
      ['cmd-1', 'node-1', 'scan', { foo: 'bar' }, null, 'queued']
    );
    expect(result).toMatchObject({
      id: 'cmd-1',
      nodeId: 'node-1',
      type: 'scan',
      idempotencyKey: null,
      state: 'queued',
      retryCount: 0,
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('enqueue returns existing command when ON CONFLICT triggers for idempotency key', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 });

    const result = await CommandModel.enqueue({
      id: 'cmd-1',
      nodeId: 'node-1',
      type: 'wake',
      payload: { foo: 'bar' },
      idempotencyKey: 'idem-1',
    });

    expect(result.id).toBe('cmd-1');
    expect(result.idempotencyKey).toBe('idem-1');
    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query.mock.calls[1][0]).toContain(
      'SELECT * FROM commands WHERE node_id = $1 AND idempotency_key = $2'
    );
  });

  it('enqueue throws when conflict fallback cannot find existing command', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      CommandModel.enqueue({
        id: 'cmd-1',
        nodeId: 'node-1',
        type: 'wake',
        payload: { foo: 'bar' },
        idempotencyKey: 'idem-1',
      })
    ).rejects.toThrow('Failed to insert or retrieve existing command');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to enqueue command',
      expect.objectContaining({
        nodeId: 'node-1',
        id: 'cmd-1',
      })
    );
  });

  it('markSent/markAcknowledged/markFailed/markTimedOut issue PostgreSQL update queries', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await CommandModel.markSent('cmd-1');
    await CommandModel.markAcknowledged('cmd-1');
    await CommandModel.markFailed('cmd-1', 'failed');
    await CommandModel.markTimedOut('cmd-1', 'timed out');

    expect(mockDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SET state = $2, sent_at = NOW(), retry_count = retry_count + 1'),
      ['cmd-1', 'sent']
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET state = $2, completed_at = NOW()'),
      ['cmd-1', 'acknowledged']
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET state = $2, error = $3, completed_at = NOW()'),
      ['cmd-1', 'failed', 'failed']
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('SET state = $2, error = $3, completed_at = NOW()'),
      ['cmd-1', 'timed_out', 'timed out']
    );
  });

  it('findById returns null when no record exists', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await CommandModel.findById('missing');
    expect(result).toBeNull();
  });

  it('findByIdempotencyKey returns mapped record', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 });

    const result = await CommandModel.findByIdempotencyKey('node-1', 'idem-1');
    expect(result).toMatchObject({
      id: 'cmd-1',
      nodeId: 'node-1',
      idempotencyKey: 'idem-1',
    });
  });

  it('listRecent uses node filter when provided and global list otherwise', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query
      .mockResolvedValueOnce({ rows: [createRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [createRow({ id: 'cmd-2' })], rowCount: 1 });

    const byNode = await CommandModel.listRecent({ nodeId: 'node-1', limit: 10 });
    const global = await CommandModel.listRecent({ limit: 5 });

    expect(byNode).toHaveLength(1);
    expect(global).toHaveLength(1);
    expect(mockDb.query.mock.calls[0][0]).toContain('WHERE node_id = $1');
    expect(mockDb.query.mock.calls[1][0]).toContain('SELECT * FROM commands ORDER BY created_at DESC');
  });

  it('reconcileStaleInFlight returns 0 for non-positive timeout and rowCount otherwise', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const noOp = await CommandModel.reconcileStaleInFlight(0);
    const reconciled = await CommandModel.reconcileStaleInFlight(5000);

    expect(noOp).toBe(0);
    expect(reconciled).toBe(3);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("state IN ('queued', 'sent')"), [5]);
  });

  it('pruneOldCommands returns 0 for non-positive retention and rowCount otherwise', async () => {
    const CommandModel = await loadCommandModel();
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 4 });

    const noOp = await CommandModel.pruneOldCommands(0);
    const pruned = await CommandModel.pruneOldCommands(30);

    expect(noOp).toBe(0);
    expect(pruned).toBe(4);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM commands'),
      [30]
    );
  });
});
