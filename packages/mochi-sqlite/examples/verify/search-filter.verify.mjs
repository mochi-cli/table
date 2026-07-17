import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'search-filter';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const nameField = repo.createField({ tableId: table.id, name: 'Name Text', type: 'singleLineText' });
  const scoreField = repo.createField({ tableId: table.id, name: 'Score', type: 'number', cellValueType: 'number' });
  const noteField = repo.createField({ tableId: table.id, name: 'Note', type: 'singleLineText' });

  const an = repo.createRecord({
    tableId: table.id,
    fields: { [nameField.id]: 'An', [scoreField.id]: 10, [noteField.id]: '' },
  });
  const binh = repo.createRecord({
    tableId: table.id,
    fields: { [nameField.id]: 'Binh Alpha', [scoreField.id]: 20, [noteField.id]: 'active' },
  });
  const chi = repo.createRecord({
    tableId: table.id,
    fields: { [nameField.id]: 'Chi', [scoreField.id]: 30, [noteField.id]: null },
  });
  const dung = repo.createRecord({
    tableId: table.id,
    fields: { [nameField.id]: 'Dung', [scoreField.id]: null, [noteField.id]: 'active' },
  });

  assert.equal(repo.listRecords(table.id, { search: 'Binh' }).length, 1);
  assert.equal(repo.listRecords(table.id, { search: 'Binh Alpha' }).length, 1);
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: nameField.id, operator: 'contains', value: 'i' }],
    }).length,
    2
  );
  assert.deepEqual(
    repo
      .listRecords(table.id, {
        filters: [{ fieldId: nameField.id, operator: 'is', value: 'An' }],
      })
      .map((record) => record.id),
    [an.id]
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: nameField.id, operator: 'isNot', value: 'An' }],
    }).length,
    3
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: noteField.id, operator: 'isEmpty' }],
    }).length,
    2
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: noteField.id, operator: 'isNotEmpty' }],
    }).length,
    2
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: scoreField.id, operator: 'gt', value: 15 }],
    }).length,
    2
  );
  assert.equal(
    repo.listRecords(table.id, {
      filters: [{ fieldId: scoreField.id, operator: 'lt', value: 25 }],
    }).length,
    2
  );
  assert.deepEqual(
    repo
      .listRecords(table.id, {
        filters: [
          { fieldId: noteField.id, operator: 'isNotEmpty' },
          { fieldId: scoreField.id, operator: 'gt', value: 15 },
        ],
      })
      .map((record) => record.id),
    [binh.id]
  );
  assert.equal(
    repo.listRecords(table.id, { sorts: [{ fieldId: scoreField.id, direction: 'asc' }] })[0].id,
    dung.id
  );
  assert.equal(
    repo.listRecords(table.id, { sorts: [{ fieldId: scoreField.id, direction: 'desc' }] })[0]
      .fields[scoreField.id],
    30
  );
  assert.deepEqual(
    repo
      .listRecords(table.id, {
        sorts: [{ fieldId: nameField.id, direction: 'asc' }],
        limit: 2,
        offset: 1,
      })
      .map((record) => record.id),
    [binh.id, chi.id]
  );

  repo.updateRecord(an.id, { fields: { [nameField.id]: 'An Updated Searchable' } });
  assert.equal(repo.listRecords(table.id, { search: 'Updated Searchable' }).length, 1);

  repo.deleteRecord(binh.id);
  assert.equal(repo.listRecords(table.id, { search: 'Binh Alpha' }).length, 0);
  const trash = repo.listTrash().find((item) => item.resource_id === binh.id);
  repo.restoreTrash(trash.id);
  assert.equal(repo.listRecords(table.id, { search: 'Binh Alpha' }).length, 1);

  return { name, dbPath };
};
