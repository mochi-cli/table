import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'field-conversion';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const field = repo.createField({ tableId: table.id, name: 'Value', type: 'singleLineText' });
  const numeric = repo.createRecord({ tableId: table.id, fields: { [field.id]: '42.5' } });
  const invalidNumber = repo.createRecord({ tableId: table.id, fields: { [field.id]: 'not a number' } });
  const date = repo.createRecord({ tableId: table.id, fields: { [field.id]: '2026-07-17' } });

  repo.updateField(field.id, { type: 'number', cellValueType: 'number' });
  assert.equal(repo.getRecord(numeric.id).fields[field.id], 42.5);
  assert.equal(repo.getRecord(invalidNumber.id).fields[field.id], null);

  repo.updateRecord(date.id, { fields: { [field.id]: '2026-07-17' } });
  repo.updateField(field.id, { type: 'date', cellValueType: 'dateTime' });
  assert.equal(repo.getRecord(numeric.id).fields[field.id], null);
  assert.equal(repo.getRecord(date.id).fields[field.id], '2026-07-17T00:00:00.000Z');

  repo.updateField(field.id, { type: 'multipleSelect', cellValueType: 'string' });
  assert.deepEqual(repo.getRecord(date.id).fields[field.id], ['2026-07-17T00:00:00.000Z']);

  repo.updateField(field.id, { type: 'checkbox', cellValueType: 'boolean' });
  assert.equal(repo.getRecord(date.id).fields[field.id], true);

  return { name, dbPath };
};
