import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'undo-redo-trash';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const phone = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
  const record = repo.createRecord({ tableId: table.id, fields: { [phone.id]: '+84 123' } });

  repo.updateRecord(record.id, { fields: { [phone.id]: '+84 999' } });
  assert.equal(repo.listRecords(table.id, { search: '999' }).length, 1);

  repo.undoLastBatch();
  assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 123');
  assert.equal(repo.listRecords(table.id, { search: '999' }).length, 0);

  repo.redoLastBatch();
  assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 999');

  const deleted = repo.deleteRecord(record.id);
  assert.equal(deleted.id, record.id);
  assert.equal(repo.listRecords(table.id).length, 0);

  const trash = repo.listTrash()[0];
  const restored = repo.restoreTrash(trash.id);
  assert.equal(restored.id, record.id);
  assert.equal(repo.listRecords(table.id).length, 1);

  return { name, dbPath };
};
