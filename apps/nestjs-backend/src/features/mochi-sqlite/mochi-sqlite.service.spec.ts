import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Events } from '../../event-emitter/events/event.enum';
import { MochiSqliteService } from './mochi-sqlite.service';

const createRepository = () => ({
  createRecord: vi.fn((input) => ({ id: 'rec_1', table_id: input.tableId, fields: input.fields })),
  getRecord: vi.fn((id) => ({
    id,
    table_id: 'tbl_1',
    fields: { fld_1: 'before' },
  })),
  updateRecord: vi.fn((id, patch) => ({
    id,
    table_id: 'tbl_1',
    fields: patch.fields,
  })),
  deleteRecord: vi.fn((id) => ({ id, table_id: 'tbl_1' })),
  getView: vi.fn((id) => ({ id, table_id: 'tbl_1' })),
  updateView: vi.fn((id, patch) => ({ id, table_id: 'tbl_1', ...patch })),
});

describe('MochiSqliteService realtime events', () => {
  it('emits Teable record events for Redis/ShareDB pubsub refresh', () => {
    const repository = createRepository();
    const eventEmitter = { emitAsync: vi.fn() };
    const service = new MochiSqliteService(repository as never, eventEmitter as never);

    service.createRecord({ tableId: 'tbl_1', fields: { fld_1: 'created' } });
    service.updateRecord('rec_1', { fields: { fld_1: 'updated' } });
    service.deleteRecord('rec_1');

    expect(eventEmitter.emitAsync).toHaveBeenNthCalledWith(
      1,
      Events.TABLE_RECORD_CREATE,
      expect.objectContaining({
        name: Events.TABLE_RECORD_CREATE,
        context: { entry: { type: 'mochi-sqlite', id: 'tbl_1' } },
      })
    );
    expect(eventEmitter.emitAsync).toHaveBeenNthCalledWith(
      2,
      Events.TABLE_RECORD_UPDATE,
      expect.objectContaining({
        name: Events.TABLE_RECORD_UPDATE,
        payload: expect.objectContaining({
          tableId: 'tbl_1',
          record: {
            id: 'rec_1',
            fields: { fld_1: { oldValue: undefined, newValue: 'updated' } },
          },
        }),
      })
    );
    expect(eventEmitter.emitAsync).toHaveBeenNthCalledWith(
      3,
      Events.TABLE_RECORD_DELETE,
      expect.objectContaining({
        name: Events.TABLE_RECORD_DELETE,
        payload: { tableId: 'tbl_1', recordId: 'rec_1' },
      })
    );
  });

  it('updates view metadata with the table scope used by local realtime', () => {
    const repository = createRepository();
    const service = new MochiSqliteService(repository as never);

    expect(
      service.updateView(
        'viw_1',
        {
          filter: { filterSet: [{ fieldId: 'fld_1', operator: 'contains', value: 'A' }] },
        },
        'tbl_1'
      )
    ).toMatchObject({
      id: 'viw_1',
      table_id: 'tbl_1',
    });

    expect(repository.updateView).toHaveBeenCalledWith('viw_1', {
      filter: { filterSet: [{ fieldId: 'fld_1', operator: 'contains', value: 'A' }] },
    });
  });

  it('reads records written by another process to the same Mochi workspace database', async () => {
    const moduleUrl = pathToFileURL(
      path.resolve(process.cwd(), '../../packages/mochi-sqlite/src/index.mjs')
    ).href;
    const { MochiSqliteRepository } = (await import(/* webpackIgnore: true */ moduleUrl)) as {
      MochiSqliteRepository: new (dbPath: string) => {
        init: () => void;
        createRecord: (input: { tableId: string; fields: Record<string, unknown> }) => unknown;
      };
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-service-external-'));
    const dbPath = path.join(tmpDir, 'workspace.mochi', 'data.sqlite');
    const uiRepository = new MochiSqliteRepository(dbPath);
    uiRepository.init();
    const service = new MochiSqliteService(uiRepository as never);
    const base = service.createBase({ name: 'Inventory' }) as { id: string };
    const table = service.createTable({
      baseId: base.id,
      name: 'Products',
      primaryFieldName: 'Product_Name',
    }) as { id: string };
    const primaryField = (
      service.listFields(table.id) as Array<{ id: string; is_primary?: number }>
    ).find((field) => field.is_primary);

    expect(service.listRecords(table.id)).toHaveLength(0);

    const externalRepository = new MochiSqliteRepository(dbPath);
    externalRepository.init();
    externalRepository.createRecord({
      tableId: table.id,
      fields: { [primaryField?.id ?? 'fld_missing']: 'External Product' },
    });

    expect(service.listRecords(table.id)).toEqual([
      expect.objectContaining({
        fields: { [primaryField?.id ?? 'fld_missing']: 'External Product' },
      }),
    ]);
  });
});
