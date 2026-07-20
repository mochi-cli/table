import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Events } from '../../event-emitter/events/event.enum';
import { MochiSqliteService } from './mochi-sqlite.service';

type RuntimeRepository = {
  init: () => void;
  createRecord: (input: { tableId: string; fields: Record<string, unknown> }) => unknown;
  db: {
    run: (sql: string) => string;
  };
};

const loadRuntimeRepository = async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(process.cwd(), '../../packages/mochi-sqlite/src/index.mjs')
  ).href;
  return (await import(/* webpackIgnore: true */ moduleUrl)) as {
    MochiSqliteRepository: new (dbPath: string) => RuntimeRepository;
  };
};

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
    const { MochiSqliteRepository } = await loadRuntimeRepository();
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

  it('bootstraps MochiKit collections and records into the local table schema', async () => {
    const { MochiSqliteRepository } = await loadRuntimeRepository();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochikit-bootstrap-'));
    const dbPath = path.join(tmpDir, 'workspace.mochi', 'data.sqlite');
    const repository = new MochiSqliteRepository(dbPath);
    repository.init();
    repository.db.run(`
      CREATE TABLE IF NOT EXISTS collections (
        name TEXT PRIMARY KEY,
        schema_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL REFERENCES collections(name) ON DELETE CASCADE,
        id TEXT NOT NULL,
        title TEXT,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        data_json TEXT NOT NULL DEFAULT '{}',
        text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      INSERT INTO collections (name, schema_json, created_at)
      VALUES (
        'Products',
        '{"titleField":"Product_Name","fields":{"Product_ID":"text","Product_Name":"text"}}',
        '2026-07-20T00:00:00.000Z'
      );
      INSERT INTO records (
        collection, id, title, aliases_json, tags_json, data_json, text, created_at, updated_at
      )
      VALUES (
        'Products',
        'table-sync-p1',
        'Table Sync Product',
        '[]',
        '[]',
        '{"Product_ID":"table-sync-p1","Product_Name":"Table Sync Product"}',
        '',
        '2026-07-20T00:00:00.000Z',
        '2026-07-20T00:00:01.000Z'
      );
    `);

    const service = new MochiSqliteService(repository as never);
    const bases = service.listBases('spc_local') as Array<{ id: string; name: string }>;
    const tables = service.listTables(bases[0].id) as Array<{ id: string; name: string }>;
    const productsTable = tables.find((table) => table.name === 'Products');
    const fields = service.listFields(productsTable?.id ?? '') as Array<{
      id: string;
      name: string;
      is_primary?: number;
    }>;
    const productNameField = fields.find((field) => field.name === 'Product_Name');

    expect(bases).toEqual([expect.objectContaining({ name: 'Local Base' })]);
    expect(tables).toEqual([expect.objectContaining({ name: 'Products' })]);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Product_ID' }),
        expect.objectContaining({ name: 'Product_Name', is_primary: 1 }),
      ])
    );
    expect(service.listRecords(productsTable?.id ?? '')).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({
          [productNameField?.id ?? 'fld_missing']: 'Table Sync Product',
        }),
      }),
    ]);
  });
});
