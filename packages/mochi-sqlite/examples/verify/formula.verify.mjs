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
  const upperItem = repo.createField({
    tableId: table.id,
    name: 'Upper item',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'UPPER({Item})' },
  });
  const lowerItem = repo.createField({
    tableId: table.id,
    name: 'Lower item',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'LOWER({Item})' },
  });
  const itemLength = repo.createField({
    tableId: table.id,
    name: 'Item length',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: 'LEN({Item})' },
  });
  const adjustedTotal = repo.createField({
    tableId: table.id,
    name: 'Adjusted total',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: `({${qty.id}} + 2) * ({${price.id}} - 2.5)` },
  });
  const trimmedLeft = repo.createField({
    tableId: table.id,
    name: 'Trimmed left',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'LEFT(TRIM("  Mochi  "), 3)' },
  });
  const rightRepeat = repo.createField({
    tableId: table.id,
    name: 'Right repeat',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'REPT(RIGHT({Item}, 1), 3)' },
  });
  const roundedAverage = repo.createField({
    tableId: table.id,
    name: 'Rounded average',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: 'ROUND(AVERAGE({Qty}, {Price}, 10), 1)' },
  });
  const minMaxSpread = repo.createField({
    tableId: table.id,
    name: 'Min max spread',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: 'MAX({Qty}, {Price}, 10) - MIN({Qty}, {Price}, 10)' },
  });
  const absIf = repo.createField({
    tableId: table.id,
    name: 'Abs if',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: 'IF({Qty}, ABS(-7), SUM(1, 2))' },
  });
  const logicalLabel = repo.createField({
    tableId: table.id,
    name: 'Logical label',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'IF(AND({Qty} > 2, NOT(ISBLANK({Item}))), "stocked", "empty")' },
  });
  const dateLabel = repo.createField({
    tableId: table.id,
    name: 'Date label',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: {
      expression: 'DATETIME_FORMAT(DATEADD("2026-07-18T00:00:00Z", 2, "days"), "YYYY-MM-DD")',
    },
  });
  const numericParity = repo.createField({
    tableId: table.id,
    name: 'Numeric parity',
    type: 'formula',
    cellValueType: 'number',
    isComputed: true,
    options: { expression: 'POWER(2, 3) + MOD(10, 4) + SQRT(9) + FLOOR(4.8) + CEILING(4.1)' },
  });
  const roundingParity = repo.createField({
    tableId: table.id,
    name: 'Rounding parity',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: { expression: 'CONCATENATE(ROUNDUP(1.21, 1), ":", ROUNDDOWN(1.29, 1))' },
  });
  const dateParts = repo.createField({
    tableId: table.id,
    name: 'Date parts',
    type: 'formula',
    cellValueType: 'string',
    isComputed: true,
    options: {
      expression:
        'CONCATENATE(YEAR("2026-07-18T09:08:07Z"), "-", MONTH("2026-07-18T09:08:07Z"), "-", DAY("2026-07-18T09:08:07Z"), " ", HOUR("2026-07-18T09:08:07Z"), ":", MINUTE("2026-07-18T09:08:07Z"), ":", SECOND("2026-07-18T09:08:07Z"), " w", WEEKDAY("2026-07-18T09:08:07Z"))',
    },
  });
  const record = repo.createRecord({
    tableId: table.id,
    fields: { [item.id]: 'Tea', [qty.id]: 3, [price.id]: 12.5 },
  });

  const firstResolve = repo.resolveFormulas(table.id, { recordId: record.id });
  const resolved = repo.getRecord(record.id);

  assert.deepEqual(firstResolve, { tableId: table.id, fields: 16, records: 1, updatedRecords: 1 });
  assert.equal(resolved.fields[total.id], 37.5);
  assert.equal(resolved.fields[label.id], 'Tea x3');
  assert.equal(resolved.fields[upperItem.id], 'TEA');
  assert.equal(resolved.fields[lowerItem.id], 'tea');
  assert.equal(resolved.fields[itemLength.id], 3);
  assert.equal(resolved.fields[adjustedTotal.id], 50);
  assert.equal(resolved.fields[trimmedLeft.id], 'Moc');
  assert.equal(resolved.fields[rightRepeat.id], 'aaa');
  assert.equal(resolved.fields[roundedAverage.id], 8.5);
  assert.equal(resolved.fields[minMaxSpread.id], 9.5);
  assert.equal(resolved.fields[absIf.id], 7);
  assert.equal(resolved.fields[logicalLabel.id], 'stocked');
  assert.equal(resolved.fields[dateLabel.id], '2026-07-20');
  assert.equal(resolved.fields[numericParity.id], 22);
  assert.equal(resolved.fields[roundingParity.id], '1.3:1.2');
  assert.equal(resolved.fields[dateParts.id], '2026-7-18 9:8:7 w7');

  repo.updateRecord(record.id, { fields: { [qty.id]: 4 } });
  repo.resolveFormulas(table.id, { recordId: record.id });
  const refreshed = repo.getRecord(record.id);

  assert.equal(refreshed.fields[total.id], 50);
  assert.equal(refreshed.fields[label.id], 'Tea x4');

  return { name, dbPath };
};
