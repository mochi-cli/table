import os from 'node:os';
import path from 'node:path';
import { MochiSqliteRepository } from '../src/index.mjs';

const dbPath = process.argv[2] ?? path.join(os.tmpdir(), 'mochi-table-smoke.sqlite');
const repo = new MochiSqliteRepository(dbPath);

repo.init();
const base = repo.createBase({ name: 'Demo base' });
const table = repo.createTable({ baseId: base.id, name: 'Customers' });
const phone = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
const record = repo.createRecord({
  tableId: table.id,
  fields: {
    [phone.id]: '+84 123 456',
  },
});
const updated = repo.updateRecord(record.id, {
  fields: {
    [phone.id]: '+84 999 000',
  },
});
const undo = repo.undoLastBatch();
const afterUndo = repo.getRecord(record.id);
const redo = repo.redoLastBatch();
const afterRedo = repo.getRecord(record.id);
const linkedRecord = repo.createRecord({
  tableId: table.id,
  fields: {
    [phone.id]: '+84 555 111',
  },
});
const linkField = repo.createField({
  tableId: table.id,
  name: 'Linked customer',
  type: 'link',
  cellValueType: 'string',
});
const lookupField = repo.createField({
  tableId: table.id,
  name: 'Linked phone',
  type: 'lookup',
  cellValueType: 'string',
  isLookup: true,
  options: {
    linkFieldId: linkField.id,
    valueFieldId: phone.id,
  },
});
const recordWithLookup = repo.createRecord({
  tableId: table.id,
  fields: {
    [linkField.id]: linkedRecord.id,
  },
});
const lookupResult = repo.resolveLookupRollup(table.id, { recordId: recordWithLookup.id });
const afterLookup = repo.getRecord(recordWithLookup.id);
const searchIndex = repo.rebuildSearchIndex(table.id);
const attachment = repo.createAttachment({
  path: '/tmp/mochi-table-smoke.txt',
  name: 'mochi-table-smoke.txt',
  mimetype: 'text/plain',
  size: 0,
});
const attachmentRef = repo.attachToRecord({
  attachmentId: attachment.id,
  tableId: table.id,
  recordId: record.id,
  fieldId: phone.id,
});
const computedJob = repo.enqueueComputedJob({
  tableId: table.id,
  recordId: record.id,
  fieldId: phone.id,
  payload: { reason: 'smoke' },
});
const claimedJob = repo.claimNextComputedJob();
const completedJob = repo.completeComputedJob(claimedJob.id);

console.log(
  JSON.stringify(
    {
      dbPath,
      spaces: repo.listSpaces(),
      bases: repo.listBases(),
      tables: repo.listTables(base.id),
      fields: repo.listFields(table.id),
      views: repo.listViews(table.id),
      records: repo.listRecords(table.id),
      searchedRecords: repo.listRecords(table.id, { search: '999' }),
      record,
      updated,
      undo,
      afterUndo,
      redo,
      afterRedo,
      linkedRecord,
      linkField,
      lookupField,
      recordWithLookup,
      lookupResult,
      afterLookup,
      searchIndex,
      attachment,
      attachmentRef,
      recordAttachments: repo.listRecordAttachments(record.id),
      computedJob,
      claimedJob,
      completedJob,
    },
    null,
    2
  )
);
