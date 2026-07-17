import { describe, expect, it, vi } from 'vitest';
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
});
