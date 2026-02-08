# SQLite Support for WoLy C&C Backend

The C&C backend now supports both PostgreSQL and SQLite databases, making it easier to run in environments where Docker is not available (like VS Code tunnels).

## Configuration

Set the database type in your `.env` file:

```env
# Use SQLite (default for VS Code tunnel)
DB_TYPE=sqlite
DATABASE_URL=./db/woly-cnc.db

# Or use PostgreSQL
# DB_TYPE=postgres
# DATABASE_URL=postgresql://woly:woly_password@localhost:5432/woly_cnc
```

## Quick Start with SQLite

```bash
# Install dependencies
npm install --legacy-peer-deps

# Initialize SQLite database
npm run init-db

# Start server
npm run dev
```

## Database Initialization

The `init-db` script automatically detects the database type and uses the appropriate schema:

- **SQLite**: Uses `src/database/schema.sqlite.sql`
- **PostgreSQL**: Uses `src/database/schema.sql`

## Implementation Details

### Cross-Database Compatibility

The implementation provides a unified interface for both databases:

- **Connection Layer**: `src/database/connection.ts` dynamically chooses the database driver
- **SQLite Driver**: `src/database/sqlite-connection.ts` provides PostgreSQL-compatible interface
- **Query Translation**: Automatically converts PostgreSQL syntax (`$1, $2`) to SQLite syntax (`?, ?`)

### SQL Differences Handled

The Node model (`src/models/Node.ts`) handles these database-specific differences:

1. **Timestamps**: `NOW()` (PostgreSQL) → `CURRENT_TIMESTAMP` (SQLite)
2. **Intervals**: `INTERVAL '30000 milliseconds'` → `datetime('+30 seconds')`
3. **Aggregates**: `COUNT(*) FILTER (WHERE ...)` → `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`
4. **RETURNING Clause**: SQLite doesn't support it in all cases, so we fetch after insert

### Schema Differences

**SQLite-specific changes:**

- Array types (`TEXT[]`) → `TEXT` with JSON encoding
- `JSONB` → `TEXT` with JSON encoding
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `VARCHAR` → `TEXT`
- Trigger syntax adapted for SQLite

## Testing

Both database implementations have been tested with:

- Node registration
- Heartbeat updates
- Status tracking
- WebSocket communication

## When to Use Each Database

### Use SQLite when:

- Running in VS Code tunnels without Docker
- Developing locally without PostgreSQL installed
- Single-node deployment with low traffic
- Simplicity is preferred over scalability

### Use PostgreSQL when:

- Deploying to production with multiple nodes
- Need advanced features (full-text search, PostGIS, etc.)
- Require high concurrency and performance
- Using Docker/Kubernetes deployment

## Migration Between Databases

To switch from SQLite to PostgreSQL:

1. Export data from SQLite:
   ```bash
   sqlite3 ./db/woly-cnc.db .dump > backup.sql
   ```

2. Update `.env`:
   ```env
   DB_TYPE=postgres
   DATABASE_URL=postgresql://user:pass@host:5432/db
   ```

3. Run init-db:
   ```bash
   npm run init-db
   ```

4. Import data (after adapting SQL syntax)

## Performance Notes

- **SQLite**: Good for <100 nodes, <10 concurrent connections
- **PostgreSQL**: Scales to thousands of nodes, unlimited connections
- Both implementations use the same API interface, so switching is seamless

## Troubleshooting

### SQLite: "database is locked"

- SQLite uses file-level locking
- Ensure only one process accesses the database
- WAL mode (enabled by default) helps with concurrent reads

### Missing database file

- Run `npm run init-db` to create the database
- Ensure `db/` directory exists
- Check `DATABASE_URL` path in `.env`

### Query errors

- Check the logs for SQL syntax errors
- Verify schema is properly initialized
- Ensure Node.ts model handles both database types
