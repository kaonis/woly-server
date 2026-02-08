import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../database/connection';

beforeAll(async () => {
  await db.connect();

  const schemaPath = join(__dirname, '../database/schema.sqlite.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  await db.query(schema);
});
