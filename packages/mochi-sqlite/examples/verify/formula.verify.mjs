import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'formula';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo, 'Orders');
  const item = repo.createField({ tableId: table.id, name: 'Item', type: 'singleLineText' });
  const qty = repo.createField({
    tableId: table.id,
    name: 'Qty',
    type: 'number',
    cellValueType: 'number',
  });
  const price = repo.createField({
    tableId: table.id,
    name: 'Price',
    type: 'number',
    cellValueType: 'number',
  });
  const total = repo.createField({
    tableId: table.id,
    name: 'Total',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: `{${qty.id}} * {${price.id}}` },
  });
  const label = repo.createField({
    tableId: table.id,
    name: 'Label',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'CONCATENATE({Item}, " x", {Qty})' },
  });
  const record = repo.createRecord({
    tableId: table.id,
    fields: { [item.id]: 'Tea', [qty.id]: 3, [price.id]: 12.5 },
  });

  const firstResolve = repo.resolveFormulas(table.id, { recordId: record.id });
  const resolved = repo.getRecord(record.id);

  assert.deepEqual(firstResolve, { tableId: table.id, fields: 2, records: 1, updatedRecords: 1 });
  assert.equal(resolved.fields[total.id], 37.5);
  assert.equal(resolved.fields[label.id], 'Tea x3');

  repo.updateRecord(record.id, { fields: { [qty.id]: 4 } });
  repo.resolveFormulas(table.id, { recordId: record.id });
  const refreshed = repo.getRecord(record.id);

  assert.equal(refreshed.fields[total.id], 50);
  assert.equal(refreshed.fields[label.id], 'Tea x4');

  return { name, dbPath };
};
