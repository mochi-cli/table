import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Events } from '../../event-emitter/events/event.enum';
import { publishMochiLocalActionTrigger } from './mochi-local-realtime-publisher';
import { MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';

type JsonRecord = Record<string, unknown>;

type LocalRecord = {
  id: string;
  fields?: JsonRecord;
} & Record<string, unknown>;

type LocalViewRecord = Record<string, unknown>;

const getSqliteTableId = (value?: Record<string, unknown> | null) =>
  typeof value?.['table_id'] === 'string' ? value['table_id'] : undefined;

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
  permanentDeleteTable: (id: string) => unknown;
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
  getComment: (tableId: string, recordId: string, commentId: string) => unknown;
  listComments: (tableId: string, recordId: string, options?: { limit?: number }) => unknown[];
  countComments: (tableId: string) => Array<{ recordId: string; count: number }>;
  countRecordComments: (tableId: string, recordId: string) => number;
  createComment: (input: {
    tableId: string;
    recordId: string;
    content?: unknown;
    quoteId?: string;
    createdBy?: string;
  }) => unknown;
  updateComment: (
    tableId: string,
    recordId: string,
    commentId: string,
    patch?: { content?: unknown }
  ) => unknown;
  deleteComment: (tableId: string, recordId: string, commentId: string) => unknown;
  resolveLookupRollup: (tableId: string, options?: { recordId?: string }) => unknown;
  resolveFormulas: (tableId: string, options?: { recordId?: string }) => unknown;
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
  listRecordHistory: (
    tableId: string,
    options?: {
      recordId?: string;
      fieldIds?: string[];
      createdByIds?: string[];
      startDate?: string;
      endDate?: string;
      cursor?: string | null;
      limit?: number;
    }
  ) => { rows: unknown[]; nextCursor: string | null };
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
  importTabularData: (input: {
    kind?: string;
    name?: string;
    fileName?: string;
    baseId?: string;
    baseName?: string;
    spaceId?: string;
    profileId?: string;
    tableName?: string;
    limit?: number;
    worksheets: Array<{
      name?: string;
      columns?: string[];
      rows?: JsonRecord[];
    }>;
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
      {
        actionKey: 'deleteRecord',
        payload: { tableId, recordIds: [recordId], skipRealtime: true },
      },
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

  private emitMochiViewUpdate(tableId: string, viewId: string, updatedProperties: string[]) {
    publishMochiLocalActionTrigger(tableId, [
      {
        actionKey: 'setView',
        payload: {
          tableId,
          viewId,
          updatedProperties,
          skipRealtime: true,
        },
      },
    ]);
  }

  publishProjectedRecordRefresh(tableId: string, actionKey: 'addRecord' | 'setRecord') {
    publishMochiLocalActionTrigger(tableId, [
      { actionKey, payload: { tableId, skipRealtime: true } },
    ]);
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

  permanentDeleteTable(id: string) {
    return this.repository.permanentDeleteTable(id);
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

  updateView(id: string, patch: JsonRecord, tableIdOverride?: string) {
    const before = this.repository.getView(id) as LocalViewRecord | null;
    const updated = this.repository.updateView(id, patch) as LocalViewRecord | null;
    const tableId = tableIdOverride ?? getSqliteTableId(updated) ?? getSqliteTableId(before);
    if (tableId && Object.keys(patch).length) {
      this.emitMochiViewUpdate(tableId, id, Object.keys(patch));
    }
    return updated;
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
    const tableId = tableIdOverride ?? getSqliteTableId(updated) ?? getSqliteTableId(before);
    if (tableId && patch.fields && Object.keys(patch.fields).length) {
      this.emitMochiRecordUpdate(tableId, id, patch.fields);
    }
    return updated;
  }

  deleteRecord(id: string, tableIdOverride?: string) {
    const before = this.repository.getRecord(id) as LocalRecord | null;
    const deleted = this.repository.deleteRecord(id) as LocalRecord | null;
    const tableId = tableIdOverride ?? getSqliteTableId(before) ?? getSqliteTableId(deleted);
    if (tableId) {
      this.emitMochiRecordDelete(tableId, id);
    }
    return deleted;
  }

  getComment(tableId: string, recordId: string, commentId: string) {
    return this.repository.getComment(tableId, recordId, commentId);
  }

  listComments(tableId: string, recordId: string, options?: { limit?: number }) {
    return this.repository.listComments(tableId, recordId, options);
  }

  countComments(tableId: string) {
    return this.repository.countComments(tableId);
  }

  countRecordComments(tableId: string, recordId: string) {
    return this.repository.countRecordComments(tableId, recordId);
  }

  createComment(input: {
    tableId: string;
    recordId: string;
    content?: unknown;
    quoteId?: string;
    createdBy?: string;
  }) {
    return this.repository.createComment(input);
  }

  updateComment(
    tableId: string,
    recordId: string,
    commentId: string,
    patch?: { content?: unknown }
  ) {
    return this.repository.updateComment(tableId, recordId, commentId, patch);
  }

  deleteComment(tableId: string, recordId: string, commentId: string) {
    return this.repository.deleteComment(tableId, recordId, commentId);
  }

  resolveLookupRollup(tableId: string, options?: { recordId?: string }) {
    return this.repository.resolveLookupRollup(tableId, options);
  }

  resolveFormulas(tableId: string, options?: { recordId?: string }) {
    return this.repository.resolveFormulas(tableId, options);
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

  listRecordHistory(
    tableId: string,
    options?: {
      recordId?: string;
      fieldIds?: string[];
      createdByIds?: string[];
      startDate?: string;
      endDate?: string;
      cursor?: string | null;
      limit?: number;
    }
  ) {
    return this.repository.listRecordHistory(tableId, options);
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

  importFile(input: {
    fileName?: string;
    fileType: 'csv' | 'excel';
    contentBase64: string;
    baseId?: string;
    tableName?: string;
    limit?: number;
  }) {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    const fallbackTableName = input.tableName ?? input.fileName?.replace(/\.[^.]+$/, '');

    if (input.fileType === 'csv') {
      const text = buffer.toString('utf8');
      const parsed = Papa.parse<JsonRecord>(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });
      if (parsed.errors.length) {
        throw new Error(parsed.errors[0]?.message ?? 'Failed to parse CSV file');
      }
      return this.repository.importTabularData({
        kind: 'csv',
        fileName: input.fileName,
        baseId: input.baseId,
        tableName: fallbackTableName,
        limit: input.limit,
        worksheets: [
          {
            name: fallbackTableName ?? 'CSV import',
            columns: parsed.meta.fields ?? [],
            rows: parsed.data,
          },
        ],
      });
    }

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const worksheets = workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json<JsonRecord>(workbook.Sheets[sheetName], {
        defval: null,
        raw: true,
      });
      const columns = rows.reduce<string[]>((names, row) => {
        for (const name of Object.keys(row)) {
          if (!names.includes(name)) names.push(name);
        }
        return names;
      }, []);
      return { name: sheetName, columns, rows };
    });
    return this.repository.importTabularData({
      kind: 'excel',
      fileName: input.fileName,
      baseId: input.baseId,
      tableName: fallbackTableName,
      limit: input.limit,
      worksheets,
    });
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

  undo(tableId?: string) {
    const batch = this.repository.undoLastBatch();
    if (batch && tableId) {
      this.publishProjectedRecordRefresh(tableId, 'setRecord');
    }
    return batch;
  }

  redo(tableId?: string) {
    const batch = this.repository.redoLastBatch();
    if (batch && tableId) {
      this.publishProjectedRecordRefresh(tableId, 'setRecord');
    }
    return batch;
  }
}
