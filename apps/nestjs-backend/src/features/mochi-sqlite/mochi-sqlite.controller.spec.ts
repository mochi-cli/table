import { describe, expect, it, vi } from 'vitest';
import { MochiSqliteController } from './mochi-sqlite.controller';
import type { MochiSqliteService } from './mochi-sqlite.service';

const createService = () =>
  ({
    listSpaces: vi.fn(() => []),
    createSpace: vi.fn((input) => input),
    getSpace: vi.fn((id) => ({ id })),
    listBases: vi.fn(() => []),
    createBase: vi.fn((input) => ({ id: 'bas_test', ...input })),
    getBase: vi.fn((id) => ({ id })),
    listTables: vi.fn(() => []),
    createTable: vi.fn((input) => ({ id: 'tbl_test', ...input })),
    getTable: vi.fn((id) => ({ id })),
    listFields: vi.fn(() => []),
    createField: vi.fn((input) => ({ id: 'fld_test', ...input })),
    getField: vi.fn((id) => ({ id })),
    updateField: vi.fn((id, patch) => ({ id, ...patch })),
    listViews: vi.fn(() => []),
    createView: vi.fn((input) => ({ id: 'viw_test', ...input })),
    getView: vi.fn((id) => ({ id })),
    listRecords: vi.fn(() => []),
    rebuildSearchIndex: vi.fn((tableId) => ({ tableId })),
    resolveLookupRollup: vi.fn((tableId, options) => ({ tableId, ...options })),
    createRecord: vi.fn((input) => ({ id: 'rec_test', ...input })),
    getRecord: vi.fn((id) => ({ id })),
    updateRecord: vi.fn((id, patch) => ({ id, ...patch })),
    deleteRecord: vi.fn((id) => ({ id })),
    listRecordAttachments: vi.fn(() => []),
    attachToRecord: vi.fn((input) => input),
    listTrash: vi.fn(() => []),
    restoreTrash: vi.fn((id) => ({ id })),
    listAttachments: vi.fn(() => []),
    createAttachment: vi.fn((input) => ({ id: 'att_test', ...input })),
    getAttachment: vi.fn((id) => ({ id })),
    deleteAttachment: vi.fn((id) => ({ id })),
    listImportSources: vi.fn(() => []),
    importSqliteDatabase: vi.fn((input) => input),
    listComputedJobs: vi.fn(() => []),
    enqueueComputedJob: vi.fn((input) => ({ id: 'job_test', ...input })),
    claimNextComputedJob: vi.fn(() => ({ id: 'job_test' })),
    completeComputedJob: vi.fn((id) => ({ id, status: 'completed' })),
    failComputedJob: vi.fn((id, error) => ({ id, error, status: 'failed' })),
    undo: vi.fn(() => null),
    redo: vi.fn(() => null),
  }) as unknown as MochiSqliteService;

describe('MochiSqliteController', () => {
  it('scopes created tables and records from route params', () => {
    const service = createService();
    const controller = new MochiSqliteController(service);

    expect(controller.createTable('bas_1', { name: 'Customers' })).toMatchObject({
      baseId: 'bas_1',
      name: 'Customers',
    });
    expect(controller.createRecord('tbl_1', { fields: { fld_1: 'A' } })).toMatchObject({
      tableId: 'tbl_1',
      fields: { fld_1: 'A' },
    });
  });

  it('parses record list query filters and sorts', () => {
    const service = createService();
    const controller = new MochiSqliteController(service);

    controller.listRecords(
      'tbl_1',
      'binh',
      '25',
      '5',
      '[{"fieldId":"fld_1","operator":"contains","value":"B"}]',
      '[{"fieldId":"fld_1","direction":"desc"}]'
    );

    expect(service.listRecords).toHaveBeenCalledWith('tbl_1', {
      search: 'binh',
      limit: 25,
      offset: 5,
      filters: [{ fieldId: 'fld_1', operator: 'contains', value: 'B' }],
      sorts: [{ fieldId: 'fld_1', direction: 'desc' }],
    });
  });

  it('falls back when query JSON is invalid', () => {
    const service = createService();
    const controller = new MochiSqliteController(service);

    controller.listRecords('tbl_1', undefined, 'bad', 'bad', '{', '{');

    expect(service.listRecords).toHaveBeenCalledWith('tbl_1', {
      search: undefined,
      limit: 100,
      offset: 0,
      filters: [],
      sorts: [],
    });
  });

  it('routes lookup, import, and computed job actions to the service', () => {
    const service = createService();
    const controller = new MochiSqliteController(service);

    expect(controller.resolveLookupRollup('tbl_1', { recordId: 'rec_1' })).toMatchObject({
      tableId: 'tbl_1',
      recordId: 'rec_1',
    });
    expect(controller.importSqliteDatabase({ path: '/tmp/profile.sqlite' })).toMatchObject({
      path: '/tmp/profile.sqlite',
    });
    expect(controller.enqueueComputedJob({ tableId: 'tbl_1' })).toMatchObject({
      id: 'job_test',
      tableId: 'tbl_1',
    });
  });
});
