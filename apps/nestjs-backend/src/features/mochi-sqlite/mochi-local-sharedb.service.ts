import { Injectable, Logger } from '@nestjs/common';
import type { IGetRecordsRo } from '@teable/openapi';
import ShareDBClass from 'sharedb';
import type { Error as ShareDbError, Snapshot } from 'sharedb/lib/sharedb';
import { RedisPubSub } from '../../share-db/sharedb-redis.pubsub';
import {
  clearMochiLocalActionTriggerPublisher,
  setMochiLocalActionTriggerPublisher,
} from './mochi-local-realtime-publisher';
import { MochiSqliteService } from './mochi-sqlite.service';

const TABLE_COLLECTION_PREFIX = 'tbl';
const FIELD_COLLECTION_PREFIX = 'fld';
const VIEW_COLLECTION_PREFIX = 'viw';
const RECORD_COLLECTION_PREFIX = 'rec';

type Callback<T> = (error: ShareDbError | null, result?: T) => void;
type QueryCallback = (error: ShareDbError | null, result: Snapshot[], extra?: unknown) => void;

type LocalRecord = {
  id: string;
  table_id?: string;
  auto_number?: number;
  created_by?: string;
  last_modified_by?: string;
  fields?: Record<string, unknown>;
  created_time?: string;
  last_modified_time?: string;
};

type LocalTable = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order?: number;
  last_modified_time?: string;
};

type LocalField = {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  cell_value_type?: string;
  options?: unknown;
  meta?: unknown;
  aiConfig?: unknown;
  is_primary?: number | boolean;
  is_computed?: number | boolean;
  is_lookup?: number | boolean;
  not_null?: number | boolean;
  unique_value?: number | boolean;
};

type LocalView = {
  id: string;
  name: string;
  type?: string;
  description?: string | null;
  sort_order?: number;
  options?: unknown;
  columnMeta?: unknown;
  filter?: unknown;
  sort?: unknown;
  group?: unknown;
  created_time?: string;
  last_modified_time?: string;
};

type LocalSnapshot = Snapshot & {
  id: string;
  v: number;
  m: null;
  type: null;
  data?: Record<string, unknown>;
};

const toBool = (value: unknown) => value === true || value === 1;

const dbFieldTypeFor = (cellValueType?: string) => {
  if (cellValueType === 'number') return 'REAL';
  if (cellValueType === 'boolean') return 'BOOLEAN';
  if (cellValueType === 'dateTime') return 'DATETIME';
  return 'TEXT';
};

const defaultOptionsFor = (type: string) => {
  if (type === 'singleSelect' || type === 'multipleSelect') return { choices: [] };
  if (type === 'number') return { formatting: { type: 'decimal', precision: 2 } };
  if (type === 'date') return { formatting: { date: 'YYYY-MM-DD', time: 'None' } };
  return {};
};

const READONLY_SYSTEM_FIELD_TYPES = new Set([
  'autoNumber',
  'createdTime',
  'lastModifiedTime',
  'createdBy',
  'lastModifiedBy',
]);

const isReadonlySystemField = (type: string): boolean => READONLY_SYSTEM_FIELD_TYPES.has(type);

const normalizeFieldOptions = (type: string, options: unknown) => {
  const defaultOptions = defaultOptionsFor(type);
  const currentOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? (options as Record<string, unknown>)
      : {};
  const defaultFormatting =
    'formatting' in defaultOptions &&
    defaultOptions.formatting &&
    typeof defaultOptions.formatting === 'object' &&
    !Array.isArray(defaultOptions.formatting)
      ? (defaultOptions.formatting as Record<string, unknown>)
      : undefined;
  const currentFormatting =
    currentOptions.formatting &&
    typeof currentOptions.formatting === 'object' &&
    !Array.isArray(currentOptions.formatting)
      ? (currentOptions.formatting as Record<string, unknown>)
      : undefined;

  return {
    ...defaultOptions,
    ...currentOptions,
    ...(defaultFormatting || currentFormatting
      ? { formatting: { ...(defaultFormatting ?? {}), ...(currentFormatting ?? {}) } }
      : {}),
  };
};

const toSnapshot = (
  id: string,
  data?: Record<string, unknown>,
  versionSource?: string
): LocalSnapshot => ({
  id,
  v: Date.parse(versionSource ?? '') || 1,
  m: null,
  type: null,
  data,
});

const toTableData = (table: LocalTable, defaultViewId?: string) => ({
  id: table.id,
  name: table.name,
  dbTableName: table.id.replace(/\W/g, '_').slice(0, 63),
  description: table.description ?? undefined,
  icon: table.icon ?? undefined,
  order: table.sort_order ?? 0,
  defaultViewId,
  lastModifiedTime: table.last_modified_time,
});

const toFieldData = (field: LocalField) => {
  const cellValueType = field.cell_value_type ?? 'string';
  const type = field.type ?? 'singleLineText';
  const isComputed = toBool(field.is_computed) || isReadonlySystemField(type);
  return {
    id: field.id,
    name: field.name,
    description: field.description ?? undefined,
    type,
    options: normalizeFieldOptions(type, field.options),
    meta: field.meta ?? undefined,
    aiConfig: field.aiConfig ?? undefined,
    isPrimary: toBool(field.is_primary),
    isComputed,
    isLookup: toBool(field.is_lookup),
    notNull: toBool(field.not_null),
    unique: toBool(field.unique_value),
    cellValueType,
    isMultipleCellValue: type === 'multipleSelect' || type === 'attachment',
    dbFieldType: dbFieldTypeFor(cellValueType),
    dbFieldName: field.id.replace(/\W/g, '_').slice(0, 63),
    recordRead: true,
    recordCreate: !isComputed,
  };
};

const normalizeColumnMeta = (columnMeta: unknown) => {
  if (!Array.isArray(columnMeta)) {
    return (columnMeta ?? {}) as Record<string, unknown>;
  }

  return columnMeta.reduce<Record<string, unknown>>((acc, item) => {
    const entry = item as { fieldId?: string; columnMeta?: unknown };
    if (entry.fieldId) {
      acc[entry.fieldId] = entry.columnMeta ?? {};
    }
    return acc;
  }, {});
};

const normalizeSort = (sort: unknown) => {
  if (!sort) return undefined;
  if (Array.isArray(sort)) return { sortObjs: sort };
  const sortValue = sort as { sortObjs?: unknown };
  return Array.isArray(sortValue.sortObjs) ? sort : undefined;
};

const normalizeGroup = (group: unknown) => (Array.isArray(group) ? group : undefined);

const toViewData = (view: LocalView) => ({
  id: view.id,
  name: view.name,
  type: view.type ?? 'grid',
  description: view.description ?? undefined,
  order: view.sort_order ?? 0,
  options: view.options ?? {},
  columnMeta: normalizeColumnMeta(view.columnMeta),
  filter: view.filter,
  sort: normalizeSort(view.sort),
  group: normalizeGroup(view.group),
  isLocked: false,
  createdBy: 'usr_mochi_local',
  createdTime: view.created_time ?? new Date(0).toISOString(),
  lastModifiedTime: view.last_modified_time ?? undefined,
});

const toRecordSnapshot = (tableId: string, record: LocalRecord): LocalSnapshot => ({
  id: record.id,
  v: Date.parse(record.last_modified_time ?? record.created_time ?? '') || 1,
  m: null,
  type: null,
  data: {
    id: record.id,
    tableId,
    fields: record.fields ?? {},
    autoNumber: record.auto_number,
    createdTime: record.created_time,
    lastModifiedTime: record.last_modified_time,
    createdBy: record.created_by ?? 'usr_mochi_local',
    lastModifiedBy: record.last_modified_by ?? record.created_by ?? 'usr_mochi_local',
  },
});

class MochiLocalShareDbAdapter extends ShareDBClass.DB {
  closed = false;
  pollDebounce = 50;

  constructor(private readonly mochiSqliteService: MochiSqliteService) {
    super();
  }

  private parseCollection(collection: string) {
    const separator = collection.indexOf('_');
    if (separator < 0) {
      return { docType: collection, collectionId: undefined };
    }
    const docType = collection.slice(0, separator);
    const collectionId = collection.slice(separator + 1);
    return { docType, collectionId };
  }

  getSnapshot(
    collection: string,
    id: string,
    _fields: unknown,
    _options: unknown,
    callback: Callback<Snapshot>
  ) {
    const { docType, collectionId } = this.parseCollection(collection);
    if (!collectionId) {
      callback(null, { id, v: 0, type: null, data: undefined } as unknown as Snapshot);
      return;
    }

    if (docType === TABLE_COLLECTION_PREFIX && collectionId) {
      const table = this.mochiSqliteService.getTable(id) as LocalTable | null;
      const defaultViewId = table
        ? (this.mochiSqliteService.listViews(table.id) as LocalView[])[0]?.id
        : undefined;
      callback(
        null,
        table
          ? toSnapshot(table.id, toTableData(table, defaultViewId), table.last_modified_time)
          : ({ id, v: 0 } as Snapshot)
      );
      return;
    }

    if (docType === FIELD_COLLECTION_PREFIX && collectionId) {
      const field = this.mochiSqliteService.getField(id) as LocalField | null;
      callback(null, field ? toSnapshot(field.id, toFieldData(field)) : ({ id, v: 0 } as Snapshot));
      return;
    }

    if (docType === VIEW_COLLECTION_PREFIX && collectionId) {
      const view = this.mochiSqliteService.getView(id) as LocalView | null;
      callback(
        null,
        view
          ? toSnapshot(view.id, toViewData(view), view.last_modified_time)
          : ({ id, v: 0 } as Snapshot)
      );
      return;
    }

    if (docType !== RECORD_COLLECTION_PREFIX || !collectionId) {
      callback(null, { id, v: 0, type: null, data: undefined } as unknown as Snapshot);
      return;
    }

    const record = this.mochiSqliteService.getRecord(id) as LocalRecord | null;
    callback(null, record ? toRecordSnapshot(collectionId, record) : ({ id, v: 0 } as Snapshot));
  }

  query = (
    collection: string,
    query: IGetRecordsRo | undefined,
    _fields: unknown,
    _options: unknown,
    callback: QueryCallback
  ) => {
    const { docType, collectionId } = this.parseCollection(collection);
    if (!collectionId) {
      callback(null, []);
      return;
    }

    if (docType === TABLE_COLLECTION_PREFIX) {
      const tables = this.mochiSqliteService.listTables(collectionId) as LocalTable[];
      callback(
        null,
        tables.map((table) => {
          const defaultViewId = (this.mochiSqliteService.listViews(table.id) as LocalView[])[0]?.id;
          return toSnapshot(table.id, toTableData(table, defaultViewId), table.last_modified_time);
        })
      );
      return;
    }

    if (docType === FIELD_COLLECTION_PREFIX) {
      const fields = this.mochiSqliteService.listFields(collectionId) as LocalField[];
      callback(
        null,
        fields.map((field) => toSnapshot(field.id, toFieldData(field)))
      );
      return;
    }

    if (docType === VIEW_COLLECTION_PREFIX) {
      const views = this.mochiSqliteService.listViews(collectionId) as LocalView[];
      callback(
        null,
        views.map((view) => toSnapshot(view.id, toViewData(view), view.last_modified_time))
      );
      return;
    }

    if (docType !== RECORD_COLLECTION_PREFIX) {
      callback(null, []);
      return;
    }

    const records = this.mochiSqliteService.listRecords(collectionId, {
      search: typeof query?.search === 'string' ? query.search : undefined,
      limit: query?.take,
      offset: query?.skip,
      filters: Array.isArray(query?.filter) ? query.filter : [],
      sorts: Array.isArray(query?.orderBy) ? query.orderBy : [],
    }) as LocalRecord[];

    callback(
      null,
      records.map((record) => toRecordSnapshot(collectionId, record))
    );
  };

  getOps(
    _collection: string,
    _id: string,
    _from: number,
    _to: number | null,
    _options: unknown,
    callback: Callback<unknown[]>
  ) {
    callback(null, []);
  }

  close(callback?: () => void) {
    this.closed = true;
    callback?.();
  }

  commit(
    _collection: string,
    _id: string,
    _op: unknown,
    _snapshot: unknown,
    _options: unknown,
    callback: Callback<boolean>
  ) {
    callback(null, false);
  }
}

@Injectable()
export class MochiLocalShareDbService extends ShareDBClass {
  private readonly logger = new Logger(MochiLocalShareDbService.name);
  private readonly publishActionTrigger = (
    tableId: string,
    data: Array<{
      actionKey: 'addRecord' | 'setRecord' | 'deleteRecord' | 'setView';
      payload?: Record<string, unknown>;
    }>
  ) => {
    const presence = this.connect().getPresence(`__action_trigger_${tableId}`);
    const localPresence = presence.create(tableId);
    localPresence.submit(data, (error) => {
      if (error) {
        this.logger.error(error);
      }
    });
  };

  constructor(mochiSqliteService: MochiSqliteService) {
    super({
      presence: true,
      doNotForwardSendPresenceErrorsToClient: true,
      db: new MochiLocalShareDbAdapter(mochiSqliteService),
      maxSubmitRetries: 0,
    });

    const redisURI = process.env.BACKEND_CACHE_REDIS_URI;
    if (process.env.BACKEND_CACHE_PROVIDER === 'redis' && redisURI) {
      this.pubsub = new RedisPubSub({ redisURI });
      this.logger.log(`Mochi local ShareDB Redis pub/sub enabled: ${redisURI}`);
    }

    this.use('connect', (context, callback) => {
      context.agent.custom.userId = 'usr_mochi_local';
      callback();
    });

    this.use('query', (context, callback) => {
      context.options = {
        ...(context.options ?? {}),
        agentCustom: context.agent.custom,
      };
      callback();
    });

    setMochiLocalActionTriggerPublisher(this.publishActionTrigger);
  }

  close(callback?: (error?: Error) => void) {
    clearMochiLocalActionTriggerPublisher(this.publishActionTrigger);
    super.close(callback);
  }
}
