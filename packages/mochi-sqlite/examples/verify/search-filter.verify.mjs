import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'search-filter';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const nameField = repo.createField({ tableId: table.id, name: 'Name Text', type: 'singleLineText' });
  const scoreField = repo.createField({ tableId: table.id, name: 'Score', type: 'number', cellValueType: 'number' });

  repo.createRecord({ tableId: table.id, fields: { [nameField.id]: 'An', [scoreField.id]: 10 } });
  repo.createRecord({ tableId: table.id, fields: { [nameField.id]: 'Binh', [scoreField.id]: 20 } });
  repo.createRecord({ tableId: table.id, fields: { [nameField.id]: 'Chi', [scoreField.id]: 30 } });

  assert.equal(repo.listRecords(table.id, { search: 'Binh' }).length, 1);
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: nameField.id, operator: 'contains', value: 'i' }],
    }).length,
    2
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: scoreField.id, operator: 'gt', value: 15 }],
    }).length,
    2
  );
  assert.equal(repo.listRecords(table.id, { sorts: [{ fieldId: scoreField.id, direction: 'desc' }] })[0].fields[scoreField.id], 30);

  return { name, dbPath };
};
