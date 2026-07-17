import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MochiSqliteRepository } from '../src/index.mjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-table-verify-'));
const dbPath = path.join(tmpDir, 'mochi.sqlite');
const sourcePath = path.join(tmpDir, 'source.sqlite');

const sqlite = spawnSync(
  'sqlite3',
  [
    sourcePath,
    "CREATE TABLE customers (name TEXT, phone TEXT, score INTEGER); INSERT INTO customers VALUES ('An', '+84 111', 10), ('Binh', '+84 222', 20);",
  ],
  { encoding: 'utf8' }
);

assert.equal(sqlite.status, 0, sqlite.stderr);

const repo = new MochiSqliteRepository(dbPath);
repo.init();

const base = repo.createBase({ name: 'Verify base' });
const table = repo.createTable({ baseId: base.id, name: 'Customers' });
const phone = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
const record = repo.createRecord({ tableId: table.id, fields: { [phone.id]: '+84 123' } });
repo.updateRecord(record.id, { fields: { [phone.id]: '+84 999' } });
assert.equal(repo.listRecords(table.id, { search: '999' }).length, 1);
repo.undoLastBatch();
assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 123');
repo.redoLastBatch();
assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 999');

const linkedRecord = repo.createRecord({ tableId: table.id, fields: { [phone.id]: '+84 555' } });
const linkField = repo.createField({ tableId: table.id, name: 'Linked customer', type: 'link' });
const lookupField = repo.createField({
  tableId: table.id,
  name: 'Linked phone',
  type: 'lookup',
  isLookup: true,
  options: { linkFieldId: linkField.id, valueFieldId: phone.id },
});
const lookupRecord = repo.createRecord({
  tableId: table.id,
  fields: { [linkField.id]: linkedRecord.id },
});
repo.resolveLookupRollup(table.id, { recordId: lookupRecord.id });
assert.equal(repo.getRecord(lookupRecord.id).fields[lookupField.id], '+84 555');

const deleted = repo.deleteRecord(lookupRecord.id);
assert.equal(deleted.id, lookupRecord.id);
const trash = repo.listTrash()[0];
const restored = repo.restoreTrash(trash.id);
assert.equal(restored.id, lookupRecord.id);

const imported = repo.importSqliteDatabase({ path: sourcePath, baseName: 'Imported' });
assert.equal(imported.importedTables.length, 1);
assert.equal(repo.listRecords(imported.importedTables[0].table.id, { search: 'Binh' }).length, 1);

const job = repo.enqueueComputedJob({ tableId: table.id, recordId: record.id, fieldId: phone.id });
const claimed = repo.claimNextComputedJob();
assert.equal(claimed.id, job.id);
assert.equal(repo.completeComputedJob(claimed.id).status, 'completed');

console.log(
  JSON.stringify({
    ok: true,
    dbPath,
    sourcePath,
    checked: ['crud', 'fts-search', 'undo-redo', 'lookup', 'trash-restore', 'sqlite-import', 'computed-job'],
  })
);
