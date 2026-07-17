import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Events } from '../../event-emitter/events/event.enum';
import { publishMochiLocalActionTrigger } from './mochi-local-realtime-publisher';
import { MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';

type JsonRecord = Record<string, unknown>;

type LocalRecord = {
  id: string;
  table_id?: string;
  fields?: JsonRecord;
};

type MochiRepository = {
  listSpaces: () => unknown[];
  createSpace: (input: { id?: string; name: string; avatar?: string }) => unknown;
  getSpace: (id: string) => unknown;
  listBases: (spaceId?: string) => unknown[];
  getBase: (id: string) => unknown;
  createBase: (input: {
    id?: string;
    name: string;
    spaceId?: string;
    icon?: string;
    order?: number;
  }) => unknown;
  listTables: (baseId: string) => unknown[];
  getTable: (id: string) => unknown;
  updateTable: (id: string, patch: JsonRecord) => unknown;
  deleteTable: (id: string) => unknown;
  duplicateTable: (id: string, input?: JsonRecord) => unknown;
  createTable: (input: {
    id?: string;
    baseId: string;
    name: string;
    description?: string;
    icon?: string | null;
    order?: number;
    primaryFieldId?: string;
    primaryFieldName?: string;
    viewId?: string;
  }) => unknown;
  listFields: (tableId: string) => unknown[];
  getField: (id: string) => unknown;
  createField: (input: {
    id?: string;
    tableId: string;
    name: string;
    description?: string;
    type: string;
    cellValueType?: string;
    options?: unknown;
    meta?: unknown;
    aiConfig?: unknown;
    isPrimary?: boolean;
    isComputed?: boolean;
    isLookup?: boolean;
    notNull?: boolean;
    unique?: boolean;
    order?: number;
  }) => unknown;
  updateField: (id: string, patch: JsonRecord) => unknown;
  deleteField: (id: string) => unknown;
  listViews: (tableId: string) => unknown[];
  createView: (input: {
    tableId: string;
    name: string;
    type?: string;
    options?: unknown;
    columnMeta?: unknown;
    filter?: unknown;
    sort?: unknown;
    group?: unknown;
  }) => unknown;
  getView: (id: string) => unknown;
  updateView: (id: string, patch: JsonRecord) => unknown;
  deleteView: (id: string) => unknown;
  listRecords: (
    tableId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
      filters?: unknown[];
      sorts?: unknown[];
    }
  ) => unknown[];
  rebuildSearchIndex: (tableId: string) => unknown;
  createRecord: (input: { tableId: string; fields?: JsonRecord; order?: unknown }) => unknown;
  getRecord: (id: string) => unknown;
  updateRecord: (id: string, patch: { fields?: JsonRecord; order?: unknown }) => unknown;
  deleteRecord: (id: string) => unknown;
  resolveLookupRollup: (tableId: string, options?: { recordId?: string }) => unknown;
  listTrash: () => unknown[];
  restoreTrash: (id: string) => unknown;
  createAttachment: (input: {
    token?: string;
    name?: string;
    hash?: string;
    size?: number;
    mimetype?: string;
    path: string;
    width?: number;
    height?: number;
    thumbnailPath?: string;
  }) => unknown;
  getAttachment: (id: string) => unknown;
  listAttachments: () => unknown[];
  attachToRecord: (input: {
    attachmentId: string;
    tableId: string;
    recordId: string;
    fieldId: string;
  }) => unknown;
  listRecordAttachments: (recordId: string) => unknown[];
  deleteAttachment: (id: string) => unknown;
  listImportSources: () => unknown[];
  importSqliteDatabase: (input: {
    path: string;
    baseId?: string;
    baseName?: string;
    spaceId?: string;
    profileId?: string;
    tables?: string[];
    tableNamePrefix?: string;
    limit?: number;
  }) => unknown;
  enqueueComputedJob: (input: {
    tableId: string;
    recordId?: string;
    fieldId?: string;
    jobType?: string;
    payload?: unknown;
  }) => unknown;
  listComputedJobs: (status?: string) => unknown[];
  claimNextComputedJob: () => unknown;
  completeComputedJob: (id: string) => unknown;
  failComputedJob: (id: string, error?: string) => unknown;
  undoLastBatch: () => unknown;
  redoLastBatch: () => unknown;
};

@Injectable()
export class MochiSqliteService {
  constructor(
    @Inject(MOCHI_SQLITE_REPOSITORY) private readonly repository: MochiRepository,
    @Optional() private readonly eventEmitter?: EventEmitter2
  ) {}

  private emitMochiRecordCreate(tableId: string, record: unknown) {
    publishMochiLocalActionTrigger(tableId, [
      { actionKey: 'addRecord', payload: { tableId, skipRealtime: true } },
    ]);
    void this.eventEmitter?.emitAsync(Events.TABLE_RECORD_CREATE, {
      name: Events.TABLE_RECORD_CREATE,
      payload: {
        tableId,
        record,
      },
      context: {
        entry: { type: 'mochi-sqlite', id: tableId },
      },
    });
  }

  private emitMochiRecordUpdate(tableId: string, recordId: string, fields: JsonRecord) {
    publishMochiLocalActionTrigger(tableId, [
      {
        actionKey: 'setRecord',
        payload: { tableId, fieldIds: Object.keys(fields), skipRealtime: true },
      },
    ]);
    void this.eventEmitter?.emitAsync(Events.TABLE_RECORD_UPDATE, {
      name: Events.TABLE_RECORD_UPDATE,
      payload: {
        tableId,
        record: {
          id: recordId,
          fields: Object.fromEntries(
            Object.entries(fields).map(([fieldId, newValue]) => [
              fieldId,
              { oldValue: undefined, newValue },
            ])
          ),
        },
        oldField: undefined,
      },
      context: {
        entry: { type: 'mochi-sqlite', id: tableId },
      },
    });
  }

  private emitMochiRecordDelete(tableId: string, recordId: string) {
    publishMochiLocalActionTrigger(tableId, [
      { actionKey: 'deleteRecord', payload: { tableId, recordIds: [recordId], skipRealtime: true } },
    ]);
    void this.eventEmitter?.emitAsync(Events.TABLE_RECORD_DELETE, {
      name: Events.TABLE_RECORD_DELETE,
      payload: {
        tableId,
        recordId,
      },
      context: {
        entry: { type: 'mochi-sqlite', id: tableId },
      },
    });
  }

  listSpaces() {
    return this.repository.listSpaces();
  }

  createSpace(input: { id?: string; name: string; avatar?: string }) {
    return this.repository.createSpace(input);
  }

  getSpace(id: string) {
    return this.repository.getSpace(id);
  }

  listBases(spaceId?: string) {
    return this.repository.listBases(spaceId);
  }

  getBase(id: string) {
    return this.repository.getBase(id);
  }

  createBase(input: {
    id?: string;
    name: string;
    spaceId?: string;
    icon?: string;
    order?: number;
  }) {
    return this.repository.createBase(input);
  }

  listTables(baseId: string) {
    return this.repository.listTables(baseId);
  }

  getTable(id: string) {
    return this.repository.getTable(id);
  }

  updateTable(id: string, patch: JsonRecord) {
    return this.repository.updateTable(id, patch);
  }

  deleteTable(id: string) {
    return this.repository.deleteTable(id);
  }

  duplicateTable(id: string, input?: JsonRecord) {
    return this.repository.duplicateTable(id, input);
  }

  createTable(input: {
    id?: string;
    baseId: string;
    name: string;
    description?: string;
    icon?: string | null;
    order?: number;
    primaryFieldId?: string;
    primaryFieldName?: string;
    viewId?: string;
  }) {
    return this.repository.createTable(input);
  }

  listFields(tableId: string) {
    return this.repository.listFields(tableId);
  }

  getField(id: string) {
    return this.repository.getField(id);
  }

  createField(input: {
    id?: string;
    tableId: string;
    name: string;
    description?: string;
    type: string;
    cellValueType?: string;
    options?: unknown;
    meta?: unknown;
    aiConfig?: unknown;
    isPrimary?: boolean;
    isComputed?: boolean;
    isLookup?: boolean;
    notNull?: boolean;
    unique?: boolean;
    order?: number;
  }) {
    return this.repository.createField(input);
  }

  updateField(id: string, patch: JsonRecord) {
    return this.repository.updateField(id, patch);
  }

  deleteField(id: string) {
    return this.repository.deleteField(id);
  }

  listViews(tableId: string) {
    return this.repository.listViews(tableId);
  }

  createView(input: {
    tableId: string;
    name: string;
    type?: string;
    options?: unknown;
    columnMeta?: unknown;
    filter?: unknown;
    sort?: unknown;
    group?: unknown;
  }) {
    return this.repository.createView(input);
  }

  getView(id: string) {
    return this.repository.getView(id);
  }

  updateView(id: string, patch: JsonRecord) {
    return this.repository.updateView(id, patch);
  }

  deleteView(id: string) {
    return this.repository.deleteView(id);
  }

  listRecords(
    tableId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
      filters?: unknown[];
      sorts?: unknown[];
    }
  ) {
    return this.repository.listRecords(tableId, options);
  }

  rebuildSearchIndex(tableId: string) {
    return this.repository.rebuildSearchIndex(tableId);
  }

  createRecord(input: { tableId: string; fields?: JsonRecord; order?: unknown }) {
    const created = this.repository.createRecord(input);
    this.emitMochiRecordCreate(input.tableId, created);
    return created;
  }

  getRecord(id: string) {
    return this.repository.getRecord(id);
  }

  updateRecord(
    id: string,
    patch: { fields?: JsonRecord; order?: unknown },
    tableIdOverride?: string
  ) {
    const before = this.repository.getRecord(id) as LocalRecord | null;
    const updated = this.repository.updateRecord(id, patch) as LocalRecord | null;
    const tableId = tableIdOverride ?? updated?.table_id ?? before?.table_id;
    if (tableId && patch.fields && Object.keys(patch.fields).length) {
      this.emitMochiRecordUpdate(tableId, id, patch.fields);
    }
    return updated;
  }

  deleteRecord(id: string, tableIdOverride?: string) {
    const before = this.repository.getRecord(id) as LocalRecord | null;
    const deleted = this.repository.deleteRecord(id) as LocalRecord | null;
    const tableId = tableIdOverride ?? before?.table_id ?? deleted?.table_id;
    if (tableId) {
      this.emitMochiRecordDelete(tableId, id);
    }
    return deleted;
  }

  resolveLookupRollup(tableId: string, options?: { recordId?: string }) {
    return this.repository.resolveLookupRollup(tableId, options);
  }

  listTrash() {
    return this.repository.listTrash();
  }

  restoreTrash(id: string) {
    return this.repository.restoreTrash(id);
  }

  createAttachment(input: {
    token?: string;
    name?: string;
    hash?: string;
    size?: number;
    mimetype?: string;
    path: string;
    width?: number;
    height?: number;
    thumbnailPath?: string;
  }) {
    return this.repository.createAttachment(input);
  }

  getAttachment(id: string) {
    return this.repository.getAttachment(id);
  }

  listAttachments() {
    return this.repository.listAttachments();
  }

  attachToRecord(input: {
    attachmentId: string;
    tableId: string;
    recordId: string;
    fieldId: string;
  }) {
    return this.repository.attachToRecord(input);
  }

  listRecordAttachments(recordId: string) {
    return this.repository.listRecordAttachments(recordId);
  }

  deleteAttachment(id: string) {
    return this.repository.deleteAttachment(id);
  }

  listImportSources() {
    return this.repository.listImportSources();
  }

  importSqliteDatabase(input: {
    path: string;
    baseId?: string;
    baseName?: string;
    spaceId?: string;
    profileId?: string;
    tables?: string[];
    tableNamePrefix?: string;
    limit?: number;
  }) {
    return this.repository.importSqliteDatabase(input);
  }

  enqueueComputedJob(input: {
    tableId: string;
    recordId?: string;
    fieldId?: string;
    jobType?: string;
    payload?: unknown;
  }) {
    return this.repository.enqueueComputedJob(input);
  }

  listComputedJobs(status?: string) {
    return this.repository.listComputedJobs(status);
  }

  claimNextComputedJob() {
    return this.repository.claimNextComputedJob();
  }

  completeComputedJob(id: string) {
    return this.repository.completeComputedJob(id);
  }

  failComputedJob(id: string, error?: string) {
    return this.repository.failComputedJob(id, error);
  }

  undo() {
    return this.repository.undoLastBatch();
  }

  redo() {
    return this.repository.redoLastBatch();
  }
}
