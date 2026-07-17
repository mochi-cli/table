export type JsonRecord = Record<string, unknown>;

export type RecordQueryOptions = {
  search?: string;
  limit?: number;
  offset?: number;
  filters?: Array<{
    fieldId: string;
    operator: 'is' | 'isNot' | 'contains' | 'isEmpty' | 'isNotEmpty' | 'gt' | 'lt';
    value?: unknown;
  }>;
  sorts?: Array<{
    fieldId: string;
    direction?: 'asc' | 'desc';
  }>;
};

export class MochiSqliteRepository {
  constructor(dbPath: string);
  init(): void;
  listSpaces(): unknown[];
  createSpace(input: { id?: string; name: string; avatar?: string | null }): unknown;
  getSpace(id: string): unknown | null;
  listBases(spaceId?: string): unknown[];
  createBase(input: { id?: string; spaceId?: string; name: string; icon?: string | null; order?: number }): unknown;
  getBase(id: string): unknown | null;
  listTables(baseId: string): unknown[];
  createTable(input: {
    id?: string;
    baseId: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    order?: number;
    primaryFieldId?: string;
    primaryFieldName?: string;
    viewId?: string;
  }): unknown;
  getTable(id: string): unknown | null;
  updateTable(id: string, patch: { name?: string; description?: string | null; icon?: string | null; order?: number }): unknown | null;
  deleteTable(id: string): unknown | null;
  duplicateTable(id: string, input?: { id?: string; baseId?: string; name?: string; description?: string | null; icon?: string | null; order?: number }): unknown | null;
  listFields(tableId: string): unknown[];
  createField(input: {
    id?: string;
    tableId: string;
    name: string;
    description?: string | null;
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
  }): unknown;
  getField(id: string): unknown | null;
  updateField(id: string, patch: Record<string, unknown>): unknown | null;
  deleteField(id: string): unknown | null;
  listViews(tableId: string): unknown[];
  createView(input: Record<string, unknown>): unknown;
  getView(id: string): unknown | null;
  updateView(id: string, patch: Record<string, unknown>): unknown | null;
  deleteView(id: string): unknown | null;
  listRecords(tableId: string, options?: RecordQueryOptions): unknown[];
  searchRecordIds(tableId: string, search: string): string[];
  rebuildSearchIndex(tableId: string): { tableId: string; indexedRecords: number };
  createRecord(input: {
    id?: string;
    tableId: string;
    autoNumber?: number;
    fields?: JsonRecord;
    order?: unknown;
    batchId?: string;
    label?: string;
    source?: string;
  }): unknown;
  getRecord(id: string): unknown | null;
  updateRecord(id: string, patch: { fields?: JsonRecord; order?: unknown; batchId?: string; label?: string; source?: string }): unknown | null;
  deleteRecord(id: string, options?: { batchId?: string; label?: string; source?: string }): unknown | null;
  resolveLookupRollup(tableId: string, options?: { recordId?: string }): unknown;
  listTrash(): unknown[];
  restoreTrash(id: string): unknown | null;
  createAttachment(input: {
    id?: string;
    token?: string;
    name?: string;
    hash?: string;
    size?: number;
    mimetype?: string;
    path: string;
    width?: number;
    height?: number;
    thumbnailPath?: string;
  }): unknown;
  getAttachment(id: string): unknown | null;
  listAttachments(): unknown[];
  attachToRecord(input: {
    id?: string;
    attachmentId: string;
    tableId: string;
    recordId: string;
    fieldId: string;
  }): unknown;
  listRecordAttachments(recordId: string): unknown[];
  deleteAttachment(id: string): unknown | null;
  listImportSources(): unknown[];
  createImportSource(input: {
    id?: string;
    kind?: string;
    path: string;
    profileId?: string;
    tableId?: string;
    state?: unknown;
  }): unknown;
  importSqliteDatabase(input: {
    path: string;
    baseId?: string;
    baseName?: string;
    spaceId?: string;
    profileId?: string;
    tables?: string[];
    tableNamePrefix?: string;
    limit?: number;
  }): unknown;
  enqueueComputedJob(input: {
    id?: string;
    tableId: string;
    recordId?: string;
    fieldId?: string;
    jobType?: string;
    payload?: unknown;
  }): unknown;
  listComputedJobs(status?: string): unknown[];
  claimNextComputedJob(): unknown | null;
  completeComputedJob(id: string): unknown | null;
  failComputedJob(id: string, error?: string): unknown | null;
  undoLastBatch(): unknown | null;
  redoLastBatch(): unknown | null;
}
