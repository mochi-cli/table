import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'field-conversion';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const field = repo.createField({ tableId: table.id, name: 'Value', type: 'singleLineText' });
  const numeric = repo.createRecord({ tableId: table.id, fields: { [field.id]: '42.5' } });
  const invalidNumber = repo.createRecord({ tableId: table.id, fields: { [field.id]: 'not a number' } });
  const date = repo.createRecord({ tableId: table.id, fields: { [field.id]: '2026-07-17' } });
  const invalidDate = repo.createRecord({ tableId: table.id, fields: { [field.id]: 'not a date' } });

  repo.updateField(field.id, { type: 'number', cellValueType: 'number' });
  assert.equal(repo.getRecord(numeric.id).fields[field.id], 42.5);
  assert.equal(repo.getRecord(invalidNumber.id).fields[field.id], null);

  repo.updateField(field.id, { type: 'singleLineText', cellValueType: 'string' });
  assert.equal(repo.getRecord(numeric.id).fields[field.id], '42.5');
  assert.equal(repo.listRecords(table.id, { search: '42.5' }).length, 1);

  repo.updateRecord(date.id, { fields: { [field.id]: '2026-07-17' } });
  repo.updateRecord(invalidDate.id, { fields: { [field.id]: 'not a date' } });
  repo.updateField(field.id, { type: 'date', cellValueType: 'dateTime' });
  assert.equal(repo.getRecord(numeric.id).fields[field.id], null);
  assert.equal(repo.getRecord(date.id).fields[field.id], '2026-07-17T00:00:00.000Z');
  assert.equal(repo.getRecord(invalidDate.id).fields[field.id], null);

  repo.updateField(field.id, { type: 'multipleSelect', cellValueType: 'string' });
  assert.deepEqual(repo.getRecord(date.id).fields[field.id], ['2026-07-17T00:00:00.000Z']);

  repo.updateField(field.id, { type: 'checkbox', cellValueType: 'boolean' });
  assert.equal(repo.getRecord(date.id).fields[field.id], true);

  const boolField = repo.createField({ tableId: table.id, name: 'Boolean Text', type: 'singleLineText' });
  repo.updateRecord(date.id, { fields: { [boolField.id]: 'false' } });
  repo.updateRecord(numeric.id, { fields: { [boolField.id]: '0' } });
  repo.updateField(boolField.id, { type: 'checkbox', cellValueType: 'boolean' });
  assert.equal(repo.getRecord(date.id).fields[boolField.id], false);
  assert.equal(repo.getRecord(numeric.id).fields[boolField.id], false);

  repo.updateRecord(date.id, { fields: { [field.id]: { id: 'sel_1', title: 'VIP' } } });
  repo.updateField(field.id, { type: 'singleSelect', cellValueType: 'string' });
  assert.equal(repo.getRecord(date.id).fields[field.id], 'VIP');

  repo.updateRecord(date.id, { fields: { [field.id]: ['A', 'B'] } });
  repo.updateField(field.id, { type: 'multipleSelect', cellValueType: 'string' });
  assert.deepEqual(repo.getRecord(date.id).fields[field.id], ['A', 'B']);

  return { name, dbPath };
};
