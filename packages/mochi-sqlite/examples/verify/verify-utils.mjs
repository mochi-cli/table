import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MochiSqliteRepository } from '../../src/index.mjs';

export { assert };

export const createVerifyRepo = (name) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `mochi-table-${name}-`));
  const dbPath = path.join(tmpDir, 'mochi.sqlite');
  const repo = new MochiSqliteRepository(dbPath);
  repo.init();
  return { repo, tmpDir, dbPath };
};

export const createSourceSqlite = (tmpDir, sql) => {
  const sourcePath = path.join(tmpDir, 'source.sqlite');
  const sqlite = spawnSync('sqlite3', [sourcePath, sql], { encoding: 'utf8' });
  assert.equal(sqlite.status, 0, sqlite.stderr);
  return sourcePath;
};

export const createBasicTable = (repo, name = 'Customers') => {
  const base = repo.createBase({ name: `${name} base` });
  const table = repo.createTable({ baseId: base.id, name });
  return { base, table };
};
