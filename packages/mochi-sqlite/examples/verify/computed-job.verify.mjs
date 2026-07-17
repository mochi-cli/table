import { assert, createBasicTable, createVerifyRepo } from './verify-utils.mjs';

export const name = 'computed-job';

export const run = () => {
  const { repo, dbPath } = createVerifyRepo(name);
  const { table } = createBasicTable(repo);
  const field = repo.createField({ tableId: table.id, name: 'Phone', type: 'singleLineText' });
  const record = repo.createRecord({ tableId: table.id, fields: { [field.id]: '+84 123' } });

  const job = repo.enqueueComputedJob({ tableId: table.id, recordId: record.id, fieldId: field.id });
  const claimed = repo.claimNextComputedJob();
  assert.equal(claimed.id, job.id);
  assert.equal(claimed.status, 'running');
  assert.equal(repo.completeComputedJob(claimed.id).status, 'completed');

  return { name, dbPath };
};
