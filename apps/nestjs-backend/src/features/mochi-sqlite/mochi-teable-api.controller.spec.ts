import { describe, expect, it, vi } from 'vitest';
import type { MochiSqliteService } from './mochi-sqlite.service';
import { MochiTeableApiController } from './mochi-teable-api.controller';

const createService = () =>
  ({
    listViews: vi.fn(() => [
      {
        id: 'viw_1',
        name: 'Grid view',
        type: 'grid',
        sort_order: 0,
        columnMeta: { fld_1: { width: 220 } },
      },
    ]),
    createView: vi.fn((input) => ({ id: 'viw_new', ...input })),
    getView: vi.fn((id) => ({
      id,
      name: 'Grid view',
      type: 'grid',
      columnMeta: { fld_1: { width: 220 } },
    })),
    updateView: vi.fn((id, patch) => ({ id, name: 'Grid view', type: 'grid', ...patch })),
    deleteView: vi.fn((id) => ({ id })),
    listFields: vi.fn(() => [
      {
        id: 'fld_1',
        name: 'Name',
        type: 'singleLineText',
        cell_value_type: 'string',
        is_primary: 1,
      },
      {
        id: 'fld_2',
        name: 'Phone',
        type: 'singleLineText',
        cell_value_type: 'string',
      },
    ]),
    createField: vi.fn((input) => ({ id: 'fld_new', ...input })),
    getField: vi.fn((id) => ({
      id,
      name: 'Phone',
      type: 'singleLineText',
      cell_value_type: 'string',
      sort_order: 1,
    })),
    updateField: vi.fn((id, patch) => ({ id, name: 'Updated', type: 'singleLineText', ...patch })),
    deleteField: vi.fn((id) => ({ id })),
    listRecords: vi.fn(() => [
      {
        id: 'rec_1',
        auto_number: 1,
        fields: { fld_1: 'Alice' },
      },
      {
        id: 'rec_2',
        auto_number: 2,
        fields: { fld_1: 'Bob' },
      },
    ]),
    createRecord: vi.fn((input) => ({ id: 'rec_new', auto_number: 2, ...input })),
    getRecord: vi.fn((id) => ({ id, auto_number: 1, fields: { fld_1: 'Alice' } })),
    updateRecord: vi.fn((id, patch) => ({ id, auto_number: 1, fields: patch.fields ?? {} })),
    deleteRecord: vi.fn((id) => ({ id, fields: {} })),
  }) as unknown as MochiSqliteService;

const createStreamResponse = () => {
  const chunks: string[] = [];
  return {
    chunks,
    response: {
      writableEnded: false,
      destroyed: false,
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        chunks.push(chunk);
      }),
      flush: vi.fn(),
      end: vi.fn(),
    },
  };
};

const parseStreamEvents = (chunks: string[]) =>
  chunks
    .join('')
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()) as { id: string; data?: unknown });

describe('MochiTeableApiController', () => {
  it('maps local fields, views, and records to Teable Grid contracts', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.listFields('tbl_1')[0]).toMatchObject({
      id: 'fld_1',
      name: 'Name',
      cellValueType: 'string',
      dbFieldType: 'TEXT',
      isPrimary: true,
      recordRead: true,
      recordCreate: true,
    });
    expect(controller.listViews('tbl_1')[0]).toMatchObject({
      id: 'viw_1',
      type: 'grid',
      columnMeta: { fld_1: { width: 220 } },
    });
    expect(controller.listRecords('tbl_1').records).toContainEqual(
      expect.objectContaining({
        id: 'rec_1',
        fields: { fld_1: 'Alice' },
        autoNumber: 1,
      })
    );
  });

  it('routes write operations to SQLite service with Teable request shapes', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    controller.createRecords('tbl_1', {
      records: [{ fields: { fld_1: 'Bob' } }],
      order: { viewId: 'viw_1' },
    });
    expect(service.createRecord).toHaveBeenCalledWith({
      tableId: 'tbl_1',
      fields: { fld_1: 'Bob' },
      order: { viewId: 'viw_1' },
    });

    controller.updateRecord('tbl_1', 'rec_1', {
      record: { fields: { fld_1: 'Binh' } },
      order: { viewId: 'viw_1' },
    });
    expect(service.updateRecord).toHaveBeenCalledWith(
      'rec_1',
      {
        fields: { fld_1: 'Binh' },
        order: { viewId: 'viw_1' },
      },
      'tbl_1'
    );

    controller.updateViewColumnMeta('viw_1', {
      columnMeta: { fld_1: { hidden: true } },
    });
    expect(service.updateView).toHaveBeenCalledWith('viw_1', {
      columnMeta: { fld_1: { hidden: true } },
    });

    controller.deleteFields(['fld_2', 'fld_3']);
    expect(service.deleteField).toHaveBeenCalledTimes(2);
  });

  it('duplicates fields, views, records, and selected rows for local grid actions', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.duplicateView('tbl_1', 'viw_1')).toMatchObject({
      id: 'viw_new',
      name: 'Grid view copy',
      columnMeta: { fld_1: { width: 220 } },
    });
    expect(service.createView).toHaveBeenCalledWith({
      tableId: 'tbl_1',
      name: 'Grid view copy',
      type: 'grid',
      options: undefined,
      columnMeta: { fld_1: { width: 220 } },
      filter: undefined,
      sort: undefined,
      group: undefined,
    });

    expect(controller.duplicateRecord('tbl_1', 'rec_1', { viewId: 'viw_1' })).toMatchObject({
      id: 'rec_new',
      fields: { fld_1: 'Alice' },
    });
    expect(service.createRecord).toHaveBeenCalledWith({
      tableId: 'tbl_1',
      fields: { fld_1: 'Alice' },
      order: { viewId: 'viw_1' },
    });

    expect(controller.duplicateField('tbl_1', 'fld_2', { name: 'Phone copy' })).toMatchObject({
      id: 'fld_new',
      name: 'Phone copy',
    });
    expect(service.createField).toHaveBeenCalledWith({
      tableId: 'tbl_1',
      name: 'Phone copy',
      description: undefined,
      type: 'singleLineText',
      cellValueType: 'string',
      options: undefined,
      meta: undefined,
      aiConfig: undefined,
      isComputed: false,
      isLookup: false,
      notNull: false,
      unique: false,
      order: 1.5,
    });
    expect(service.updateRecord).toHaveBeenCalledWith(
      'rec_1',
      { fields: { fld_new: null } },
      'tbl_1'
    );

    const stream = createStreamResponse();
    controller.duplicateSelectionStream(
      'tbl_1',
      '[[0,1]]',
      'rows',
      undefined,
      undefined,
      stream.response as never
    );
    expect(parseStreamEvents(stream.chunks)).toMatchObject([
      { id: 'progress', phase: 'preparing', totalCount: 2 },
      {
        id: 'done',
        totalCount: 2,
        duplicatedCount: 2,
        data: { duplicatedCount: 2 },
      },
    ]);
  });

  it('normalizes Teable filter and sort queries before listing records', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    controller.listRecords(
      'tbl_1',
      undefined,
      '20',
      '3',
      JSON.stringify({
        conjunction: 'and',
        filterSet: [{ fieldId: 'fld_1', operator: 'is', value: 'Alice' }],
      }),
      JSON.stringify([{ fieldId: 'fld_1', direction: 'desc' }])
    );

    expect(service.listRecords).toHaveBeenLastCalledWith('tbl_1', {
      search: undefined,
      limit: 20,
      offset: 3,
      filters: [{ fieldId: 'fld_1', operator: 'is', value: 'Alice' }],
      sorts: [{ fieldId: 'fld_1', direction: 'desc' }],
    });
  });

  it('serves minimal aggregation endpoints required by Teable Grid providers', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.getRowCount('tbl_1')).toEqual({ rowCount: 2 });
    expect(controller.getAggregation()).toEqual({ aggregations: [] });
    expect(controller.getTaskStatusCollection()).toEqual({ cells: [], fieldMap: {} });
  });

  it('normalizes Teable filter and sort queries for selection helpers', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    controller.rangeToId(
      'tbl_1',
      '[[0,0]]',
      'rows',
      'recordId',
      JSON.stringify({
        conjunction: 'and',
        filterSet: [{ fieldId: 'fld_1', operator: 'contains', value: 'A' }],
      }),
      JSON.stringify([{ fieldId: 'fld_2', direction: 'asc' }])
    );

    expect(service.listRecords).toHaveBeenLastCalledWith('tbl_1', {
      limit: 100000,
      filters: [{ fieldId: 'fld_1', operator: 'contains', value: 'A' }],
      sorts: [{ fieldId: 'fld_2', direction: 'asc' }],
    });
  });

  it('maps selection ranges to record and field ids for grid paste/copy helpers', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.rangeToId('tbl_1', '[[0,1]]', 'rows', 'recordId')).toEqual({
      recordIds: ['rec_1', 'rec_2'],
    });
    expect(controller.rangeToId('tbl_1', '[[0,1]]', 'columns', 'fieldId')).toEqual({
      fieldIds: ['fld_1', 'fld_2'],
    });
    expect(controller.rangeToId('tbl_1', '[[0,0],[1,1]]', undefined, 'all')).toEqual({
      recordIds: ['rec_1', 'rec_2'],
      fieldIds: ['fld_1', 'fld_2'],
    });
  });

  it('previews temporary paste content without mutating records', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(
      controller.temporaryPaste('tbl_1', {
        ranges: [
          [0, 0],
          [1, 0],
        ],
        content: 'Alice\t090',
      })
    ).toEqual([
      {
        fields: {
          fld_1: 'Alice',
          fld_2: '090',
        },
      },
    ]);
    expect(service.updateRecord).not.toHaveBeenCalled();
  });

  it('copies selected cells by range and by id', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.copySelection('tbl_1', '[[0,0],[1,0]]')).toMatchObject({
      content: 'Alice\t',
      header: [expect.objectContaining({ id: 'fld_1' }), expect.objectContaining({ id: 'fld_2' })],
    });
    expect(
      controller.copySelectionById('tbl_1', {
        selection: {
          recordIds: ['rec_2'],
          fieldIds: ['fld_1'],
        },
      })
    ).toMatchObject({
      content: 'Bob',
      header: [expect.objectContaining({ id: 'fld_1' })],
    });
  });

  it('pastes and clears selected cells by id', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(
      controller.pasteSelectionById('tbl_1', {
        content: 'New Name\t090',
        selection: {
          recordIds: ['rec_1'],
          fieldIds: ['fld_1', 'fld_2'],
        },
      })
    ).toMatchObject({
      selection: {
        recordIds: ['rec_1'],
        fieldIds: ['fld_1', 'fld_2'],
      },
      pastedRecordIds: ['rec_1'],
    });
    expect(service.updateRecord).toHaveBeenCalledWith(
      'rec_1',
      {
        fields: {
          fld_1: 'New Name',
          fld_2: '090',
        },
      },
      'tbl_1'
    );

    expect(
      controller.clearSelectionById('tbl_1', {
        selection: {
          recordIds: ['rec_1'],
          fieldIds: ['fld_1'],
        },
      })
    ).toBeNull();
    expect(service.updateRecord).toHaveBeenCalledWith(
      'rec_1',
      {
        fields: {
          fld_1: null,
        },
      },
      'tbl_1'
    );
  });

  it('streams paste and clear events for keyboard selection operations', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    const pasteStream = createStreamResponse();
    controller.pasteSelectionByIdStream(
      'tbl_1',
      {
        content: 'Stream Name',
        selection: {
          recordIds: ['rec_1'],
          fieldIds: ['fld_1'],
        },
      },
      pasteStream.response as never
    );
    expect(pasteStream.response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream'
    );
    expect(parseStreamEvents(pasteStream.chunks)).toMatchObject([
      { id: 'progress', phase: 'preparing' },
      {
        id: 'done',
        totalCount: 1,
        processedCount: 1,
        updatedCount: 1,
        createdCount: 0,
      },
    ]);
    expect(service.updateRecord).toHaveBeenCalledWith(
      'rec_1',
      {
        fields: { fld_1: 'Stream Name' },
      },
      'tbl_1'
    );

    const clearStream = createStreamResponse();
    controller.clearSelectionByIdStream(
      'tbl_1',
      {
        selection: {
          recordIds: ['rec_1'],
          fieldIds: ['fld_1'],
        },
      },
      clearStream.response as never
    );
    expect(parseStreamEvents(clearStream.chunks)).toMatchObject([
      { id: 'progress', phase: 'preparing' },
      {
        id: 'done',
        totalCount: 1,
        processedCount: 1,
        clearedCount: 1,
        data: { clearedRecordIds: ['rec_1'] },
      },
    ]);
  });

  it('deletes selected records by range and by id', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);

    expect(controller.deleteSelection('tbl_1', '[[0,0]]', 'rows')).toEqual({
      ids: ['rec_1'],
    });
    expect(service.deleteRecord).toHaveBeenCalledWith('rec_1', 'tbl_1');

    expect(
      controller.deleteSelectionById('tbl_1', {
        selection: {
          recordIds: ['rec_2'],
        },
      })
    ).toEqual({ ids: ['rec_2'] });
    expect(service.deleteRecord).toHaveBeenCalledWith('rec_2', 'tbl_1');
  });

  it('streams delete events for keyboard selection operations', () => {
    const service = createService();
    const controller = new MochiTeableApiController(service);
    const stream = createStreamResponse();

    controller.deleteSelectionByIdStream(
      'tbl_1',
      {
        selection: {
          recordIds: ['rec_1', 'rec_2'],
        },
      },
      stream.response as never
    );

    expect(parseStreamEvents(stream.chunks)).toMatchObject([
      { id: 'progress', phase: 'preparing', totalCount: 2 },
      {
        id: 'done',
        totalCount: 2,
        deletedCount: 2,
        data: { deletedRecordIds: ['rec_1', 'rec_2'] },
      },
    ]);
    expect(service.deleteRecord).toHaveBeenCalledWith('rec_1', 'tbl_1');
    expect(service.deleteRecord).toHaveBeenCalledWith('rec_2', 'tbl_1');
  });
});
