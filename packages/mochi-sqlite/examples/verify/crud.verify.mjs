import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'crud';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const phone = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
  const record = repo.createRecord({ tableId: table.id, fields: { [phone.id]: '+84 123' } });

  assert.equal(repo.listSpaces().length, 1);
  assert.equal(repo.listTables(table.base_id).length, 1);
  assert.equal(repo.listFields(table.id).length, 2);
  assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 123');

  repo.updateRecord(record.id, { fields: { [phone.id]: '+84 999' } });
  assert.equal(repo.getRecord(record.id).fields[phone.id], '+84 999');

  const duplicated = repo.duplicateTable(table.id, {
    name: 'Customers schema only',
    includeRecords: false,
  });
  assert.equal(repo.listFields(duplicated.id).length, 2);
  assert.equal(repo.listViews(duplicated.id).length, 1);
  assert.equal(repo.listRecords(duplicated.id).length, 0);

  const permanent = repo.createTable({
    baseId: table.base_id,
    name: 'Permanent delete target',
  });
  const permanentField = repo.createField({
    tableId: permanent.id,
    name: 'Searchable',
    type: 'singleLineText',
  });
  const permanentRecord = repo.createRecord({
    tableId: permanent.id,
    fields: { [permanentField.id]: 'hard delete search token' },
  });
  repo.updateRecord(permanentRecord.id, {
    fields: { [permanentField.id]: 'hard delete updated token' },
  });
  assert.equal(repo.searchRecordIds(permanent.id, 'updated token').length, 1);

  const deleted = repo.permanentDeleteTable(permanent.id);
  assert.equal(deleted.id, permanent.id);
  assert.equal(repo.getTable(permanent.id), null);
  assert.equal(repo.duplicateTable(permanent.id), null);
  assert.equal(repo.listFields(permanent.id).length, 0);
  assert.equal(repo.listViews(permanent.id).length, 0);
  assert.equal(repo.listRecords(permanent.id).length, 0);
  assert.equal(repo.listRecordHistory(permanent.id).rows.length, 0);
  assert.equal(repo.searchRecordIds(permanent.id, 'updated token').length, 0);

  return { name, dbPath };
};
