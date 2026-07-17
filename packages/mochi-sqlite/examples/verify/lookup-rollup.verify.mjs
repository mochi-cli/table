import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'lookup-rollup';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const phone = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
  const score = repo.createField({ tableId: table.id, name: 'Score', type: 'number', cellValueType: 'number' });
  const linkedRecord = repo.createRecord({
    tableId: table.id,
    fields: { [phone.id]: '+84 555', [score.id]: 25 },
  });
  const linkField = repo.createField({ tableId: table.id, name: 'Linked customer', type: 'link' });
  const lookupField = repo.createField({
    tableId: table.id,
    name: 'Linked phone',
    type: 'lookup',
    isLookup: true,
    options: { linkFieldId: linkField.id, valueFieldId: phone.id },
  });
  const rollupField = repo.createField({
    tableId: table.id,
    name: 'Linked score sum',
    type: 'rollup',
    isLookup: true,
    options: { linkFieldId: linkField.id, valueFieldId: score.id, aggregate: 'sum' },
  });
  const lookupRecord = repo.createRecord({
    tableId: table.id,
    fields: { [linkField.id]: linkedRecord.id },
  });

  repo.resolveLookupRollup(table.id, { recordId: lookupRecord.id });
  const resolved = repo.getRecord(lookupRecord.id);

  assert.equal(resolved.fields[lookupField.id], '+84 555');
  assert.equal(resolved.fields[rollupField.id], 25);

  return { name, dbPath };
};
