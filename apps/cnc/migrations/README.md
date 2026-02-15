# Database Migrations

This directory contains database migration scripts for upgrading existing WoLy C&C Backend installations.

## Overview

The schema files in `src/database/` are used for **fresh installations only**. If you already have a running database with data, use the migration scripts in this directory to upgrade your schema without losing data.

## Migration History

| Version | File | Description | Date |
|---------|------|-------------|------|
| 001 | `001_add_commands_table.sql` (PostgreSQL)<br/>`001_add_commands_table.sqlite.sql` (SQLite) | Adds the `commands` table for Phase 4 (Durable Command Lifecycle) with lifecycle states and idempotency support | 2026-02-07 |
| 002 | `002_add_host_metadata.sql` (PostgreSQL)<br/>`002_add_host_metadata.sqlite.sql` (SQLite) | Adds `notes` and `tags` host metadata columns to `aggregated_hosts` and backfills null tags | 2026-02-15 |

## How to Apply Migrations

### PostgreSQL

For production PostgreSQL databases, run the migration script using `psql`:

```bash
# Connect to your database and run the migration
psql -U woly -d woly < migrations/001_add_commands_table.sql
psql -U woly -d woly < migrations/002_add_host_metadata.sql

# Or connect first, then run the migration
psql -U woly -d woly
\i migrations/001_add_commands_table.sql
\i migrations/002_add_host_metadata.sql
```

### SQLite

For SQLite databases (development/tunnel environments), use the `sqlite3` command:

```bash
# Run the migration
sqlite3 db/woly-cnc.db < migrations/001_add_commands_table.sqlite.sql
sqlite3 db/woly-cnc.db < migrations/002_add_host_metadata.sqlite.sql

# Or interactively
sqlite3 db/woly-cnc.db
.read migrations/001_add_commands_table.sqlite.sql
.read migrations/002_add_host_metadata.sqlite.sql
```

### Docker Environments

For Docker deployments, you can exec into the container and run the migration:

```bash
# PostgreSQL
docker-compose exec woly-cnc psql -U woly -d woly < /app/migrations/001_add_commands_table.sql

# Or copy the migration into the postgres container
docker cp migrations/001_add_commands_table.sql woly-postgres:/tmp/
docker-compose exec postgres psql -U woly -d woly -f /tmp/001_add_commands_table.sql
```

## Verifying Migrations

After applying a migration, verify the schema was updated correctly:

### PostgreSQL

```sql
-- Check if commands table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'commands';

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'commands';

-- Check constraints
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'commands'::regclass;
```

### SQLite

```sql
-- Check if commands table exists
.tables commands

-- Show table schema
.schema commands

-- List indexes
.indexes commands
```

## Migration Best Practices

1. **Backup First**: Always backup your database before running migrations
2. **Test in Staging**: Run migrations on a staging/test environment before production
3. **Use Transactions**: Migrations use `IF NOT EXISTS` clauses to be idempotent
4. **Track Versions**: Keep a record of which migrations have been applied
5. **SQLite Note**: `002_add_host_metadata.sqlite.sql` is not re-runnable; skip it once applied

## Rollback

Currently, migrations do not include rollback scripts. If you need to rollback:

1. Restore from backup, or
2. Manually drop the created tables/indexes (only if no data has been written)

For the commands table migration:

```sql
-- PostgreSQL
DROP TRIGGER IF EXISTS trigger_commands_updated_at ON commands;
DROP FUNCTION IF EXISTS update_commands_updated_at();
DROP TABLE IF EXISTS commands;

-- SQLite
DROP TRIGGER IF EXISTS trigger_commands_updated_at;
DROP TABLE IF EXISTS commands;
```

## Future Enhancements

Consider implementing a migration management tool in the future:
- **Flyway** - Java-based database migration tool
- **Liquibase** - Database schema change management
- **TypeORM migrations** - If adopting an ORM layer
- **Custom script** - Track migrations in a `schema_migrations` table
