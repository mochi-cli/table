import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const dbPath = process.argv[2] ?? path.resolve(process.cwd(), 'data/mochi-table.sqlite');
const schemaPath = path.resolve(import.meta.dirname, 'schema.sql');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const bootstrapSql = `
.read ${JSON.stringify(schemaPath)}
INSERT OR IGNORE INTO mochi_space (id, name) VALUES ('spc_local', 'Mochi Local');
`;

const result = spawnSync('sqlite3', [dbPath], {
  input: bootstrapSql,
  stdio: ['pipe', 'inherit', 'inherit'],
  encoding: 'utf8',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`SQLite database ready: ${dbPath}`);
