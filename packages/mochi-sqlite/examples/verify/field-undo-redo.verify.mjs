import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'field-undo-redo';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);

  const createdField = repo.createField({
    tableId: table.id,
    name: 'Undo Field',
    type: 'singleLineText',
  });
  assert.ok(repo.getField(createdField.id));

  repo.undoLastBatch();
  assert.equal(repo.getField(createdField.id), null);

  repo.redoLastBatch();
  assert.equal(repo.getField(createdField.id).name, 'Undo Field');

  const record = repo.createRecord({
    tableId: table.id,
    fields: { [createdField.id]: '42' },
  });

  repo.updateField(createdField.id, {
    name: 'Converted Field',
    type: 'number',
    cellValueType: 'number',
  });
  assert.equal(repo.getField(createdField.id).type, 'number');
  assert.equal(repo.getRecord(record.id).fields[createdField.id], 42);

  repo.undoLastBatch();
  assert.equal(repo.getField(createdField.id).name, 'Undo Field');
  assert.equal(repo.getField(createdField.id).type, 'singleLineText');
  assert.equal(repo.getRecord(record.id).fields[createdField.id], '42');

  repo.redoLastBatch();
  assert.equal(repo.getField(createdField.id).name, 'Converted Field');
  assert.equal(repo.getField(createdField.id).type, 'number');
  assert.equal(repo.getRecord(record.id).fields[createdField.id], 42);

  repo.deleteField(createdField.id);
  assert.equal(repo.getField(createdField.id), null);
  assert.equal(
    Object.prototype.hasOwnProperty.call(repo.getRecord(record.id).fields, createdField.id),
    false
  );

  repo.undoLastBatch();
  assert.equal(repo.getField(createdField.id).name, 'Converted Field');
  assert.equal(repo.getRecord(record.id).fields[createdField.id], 42);

  repo.redoLastBatch();
  assert.equal(repo.getField(createdField.id), null);
  assert.equal(
    Object.prototype.hasOwnProperty.call(repo.getRecord(record.id).fields, createdField.id),
    false
  );

  return { name, dbPath };
};
