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
  listViews(tableId: string): unknown[];
  createView(input: Record<string, unknown>): unknown;
  getView(id: string): unknown | null;
  listRecords(tableId: string, options?: RecordQueryOptions): unknown[];
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
  undoLastBatch(): unknown | null;
  redoLastBatch(): unknown | null;
}
