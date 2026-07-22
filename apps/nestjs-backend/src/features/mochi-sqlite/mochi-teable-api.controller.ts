import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  CellValueType,
  DbFieldType,
  FieldType,
  Relationship,
  ViewType,
  getDbFieldType,
  type IAttachmentItem,
  type IFieldVo,
  type IRecord,
  type IViewVo,
} from '@teable/core';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MochiSqliteService } from './mochi-sqlite.service';
type FieldKeyType = string;

const parseJsonQuery = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseNumberQuery = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getActorPatch = (
  headers: Record<string, string | string[] | undefined>,
  body?: { actorId?: string; source?: string }
) => ({
  actorId:
    (typeof headers['x-mochi-actor-id'] === 'string' && headers['x-mochi-actor-id']) ||
    (typeof headers['x-mochi-actor'] === 'string' && headers['x-mochi-actor']) ||
    body?.actorId,
  source: body?.source,
});

const parseArrayQuery = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.length > 0) return [value];
  return undefined;
};

const parseJsonArrayQuery = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = parseJsonQuery<unknown>(value, undefined);
  if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  return [value];
};

const parseLinkCellQuery = (value: unknown): string | [string, string] | undefined => {
  const parsed = parseJsonArrayQuery(value);
  if (!parsed?.length) return undefined;
  return parsed.length >= 2 ? [parsed[0], parsed[1]] : parsed[0];
};

const normalizeSearchQuery = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  if (typeof value === 'string') {
    const parsed = parseJsonQuery<unknown>(value, undefined);
    if (Array.isArray(parsed)) {
      return typeof parsed[0] === 'string' && parsed[0].length > 0 ? parsed[0] : undefined;
    }
    return value;
  }
  return undefined;
};

const parseRangesQuery = (value: unknown): [number, number][] => {
  const parsed = parseJsonQuery<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((range) => (Array.isArray(range) ? range : []))
    .filter((range): range is [number, number] => range.length === 2)
    .map(([start, end]): [number, number] => [Number(start), Number(end)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end));
};

const expandIndexRange = (start: number, end: number, max: number) => {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(max - 1, Math.max(start, end));
  const indexes: number[] = [];
  for (let index = from; index <= to; index += 1) {
    indexes.push(index);
  }
  return indexes;
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

const parsePasteContent = (content: TemporaryPasteBody['content']): unknown[][] => {
  if (Array.isArray(content)) return content;
  if (typeof content !== 'string') return [[]];
  const rows = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const parsed = rows.map((row) => row.split('\t'));
  return parsed.length ? parsed : [[]];
};

const stringifyCopyValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const normalizeFilterQuery = (filter: unknown): unknown[] => {
  const parsed = typeof filter === 'string' ? parseJsonQuery<unknown>(filter, []) : filter;
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const filterSet = (parsed as { filterSet?: unknown }).filterSet;
  return Array.isArray(filterSet)
    ? filterSet.filter(
        (item) => item && typeof item === 'object' && !('filterSet' in (item as object))
      )
    : [];
};

const normalizeSortQuery = (orderBy: unknown): unknown[] => {
  const parsed = typeof orderBy === 'string' ? parseJsonQuery<unknown>(orderBy, []) : orderBy;
  return Array.isArray(parsed) ? parsed : [];
};

const getQueryValue = (query: Record<string, unknown>, key: string): unknown =>
  query[key] ?? query[`${key}[]`];

const getLinkRecordIds = (cellValue: unknown): string[] => {
  const values = Array.isArray(cellValue) ? cellValue : [cellValue];
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        const id = (value as { id?: unknown }).id;
        return typeof id === 'string' ? id : undefined;
      }
      return undefined;
    })
    .filter((id): id is string => Boolean(id));
};

const uniqueRecords = (records: LocalRecord[]): LocalRecord[] => {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
};

type UpdateRecordBody = {
  fieldKeyType?: FieldKeyType;
  fields?: Record<string, unknown>;
  record?: {
    fields?: Record<string, unknown>;
  };
  order?: unknown;
  actorId?: string;
  source?: string;
};

type CreateRecordsBody = {
  fieldKeyType?: FieldKeyType;
  records?: Array<{
    fields?: Record<string, unknown>;
  }>;
  order?: unknown;
  actorId?: string;
  source?: string;
};

type InsertAttachmentBody = {
  attachments?: IAttachmentItem[];
  anchorId?: string;
  actorId?: string;
  source?: string;
};

type FieldBody = {
  name?: string;
  description?: string;
  type?: string;
  cellValueType?: string;
  options?: unknown;
  meta?: unknown;
  aiConfig?: unknown;
  isPrimary?: boolean;
  isComputed?: boolean;
  isLookup?: boolean;
  notNull?: boolean;
  unique?: boolean;
  viewId?: string;
};

type ViewBody = {
  name?: string;
  type?: string;
  options?: unknown;
  columnMeta?: unknown;
  filter?: unknown;
  sort?: unknown;
  group?: unknown;
};

type ColumnMetaBody =
  | ViewBody
  | Array<{
      fieldId?: string;
      columnMeta?: unknown;
    }>;

type ColumnMetaPatchEntry = Extract<ColumnMetaBody, unknown[]>[number];

type RangeType = 'rows' | 'columns';
type IdReturnType = 'recordId' | 'fieldId' | 'all';

type TemporaryPasteBody = {
  content?: string | unknown[][];
  ranges?: [number, number][];
  actorId?: string;
  source?: string;
};

type SelectionIdBody = {
  filter?: string | unknown[] | Record<string, unknown>;
  orderBy?: string | unknown[];
  projection?: string[];
  selection?: {
    recordIds?: string[];
    excludeRecordIds?: string[];
    fieldIds?: string[];
  };
  actorId?: string;
  source?: string;
};

type PasteByIdBody = SelectionIdBody & {
  content?: string | unknown[][];
  header?: unknown[];
};

type UndoRedoMode = 'undo' | 'redo';

type UndoRedoResponse = {
  status: 'fulfilled' | 'failed' | 'empty';
  errorMessage?: string;
};

type RangeBody = {
  ranges?: [number, number][];
  content?: string | unknown[][];
  filter?: string | unknown[] | Record<string, unknown>;
  orderBy?: string | unknown[];
  actorId?: string;
  source?: string;
};

type FieldPlan = {
  estimateTime: number;
  graph?: {
    nodes: unknown[];
    edges: unknown[];
    combos: unknown[];
  };
  updateCellCount: number;
  linkFieldCount?: number;
  skip?: boolean;
};

type LocalField = {
  id: string;
  table_id?: string;
  name: string;
  description?: string | null;
  type: string;
  cell_value_type?: string;
  options?: unknown;
  meta?: unknown;
  aiConfig?: unknown;
  is_primary?: number | boolean;
  is_computed?: number | boolean;
  is_lookup?: number | boolean;
  not_null?: number | boolean;
  unique_value?: number | boolean;
  sort_order?: number;
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

type LocalRecordHistoryRow = {
  id: string;
  table_id: string;
  record_id: string;
  field_id: string;
  before: unknown;
  after: unknown;
  created_time: string;
  field: LocalField;
};

type LocalRecordHistoryVo = {
  historyList: Array<{
    id: string;
    tableId: string;
    recordId: string;
    fieldId: string;
    before: { meta: unknown; data: unknown };
    after: { meta: unknown; data: unknown };
    createdTime: string;
    createdBy: string;
  }>;
  userMap: Record<string, { id: string; name: string; email?: string; avatar: string | null }>;
  nextCursor: string | null;
};

const toBool = (value: unknown) => value === true || value === 1;

const normalizeCellValueType = (cellValueType?: string): CellValueType => {
  if (Object.values(CellValueType).includes(cellValueType as CellValueType)) {
    return cellValueType as CellValueType;
  }
  return CellValueType.String;
};

const normalizeFieldType = (type?: string): FieldType =>
  Object.values(FieldType).includes(type as FieldType)
    ? (type as FieldType)
    : FieldType.SingleLineText;

const defaultCellValueTypeFor = (type?: string): CellValueType => {
  switch (normalizeFieldType(type)) {
    case FieldType.Number:
    case FieldType.Rating:
    case FieldType.AutoNumber:
      return CellValueType.Number;
    case FieldType.Checkbox:
      return CellValueType.Boolean;
    case FieldType.Date:
    case FieldType.CreatedTime:
    case FieldType.LastModifiedTime:
      return CellValueType.DateTime;
    default:
      return CellValueType.String;
  }
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isMultipleCellValueFor = (type: FieldType, options: unknown): boolean => {
  if (type === FieldType.MultipleSelect || type === FieldType.Attachment) return true;
  if (!isObjectRecord(options)) return false;
  if (type === FieldType.User) return options.isMultiple === true;
  if (type === FieldType.Link) {
    return (
      options.relationship === Relationship.ManyMany ||
      options.relationship === Relationship.OneMany
    );
  }
  return false;
};

const getFieldMetadata = (field: LocalField) => {
  const type = normalizeFieldType(field.type);
  const cellValueType = field.cell_value_type
    ? normalizeCellValueType(field.cell_value_type)
    : defaultCellValueTypeFor(type);
  const isMultipleCellValue = isMultipleCellValueFor(type, field.options);
  return {
    type,
    cellValueType,
    isMultipleCellValue,
    dbFieldType: getDbFieldType(type, cellValueType, isMultipleCellValue),
  };
};

const emptyFieldPlan = (): FieldPlan => ({
  estimateTime: 0,
  graph: { nodes: [], edges: [], combos: [] },
  updateCellCount: 0,
  linkFieldCount: 0,
});

const defaultOptionsFor = (type: string) => {
  if (type === FieldType.SingleSelect || type === FieldType.MultipleSelect) return { choices: [] };
  if (type === FieldType.Number) return { formatting: { type: 'decimal', precision: 2 } };
  if (type === FieldType.Date) return { formatting: { date: 'YYYY-MM-DD', time: 'None' } };
  return {};
};

const normalizeFieldOptions = (type: string, options: unknown): IFieldVo['options'] => {
  const defaultOptions = defaultOptionsFor(type) as Record<string, unknown>;
  const currentOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? (options as Record<string, unknown>)
      : {};
  const defaultFormatting =
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
  } as IFieldVo['options'];
};

const toTeableField = (field: LocalField | null | undefined): IFieldVo | null => {
  if (!field) return null;
  const { type, cellValueType, isMultipleCellValue, dbFieldType } = getFieldMetadata(field);

  return {
    id: field.id,
    name: field.name,
    description: field.description ?? undefined,
    type,
    options: normalizeFieldOptions(type, field.options),
    meta: field.meta as IFieldVo['meta'],
    aiConfig: field.aiConfig as IFieldVo['aiConfig'],
    isPrimary: toBool(field.is_primary),
    isComputed: toBool(field.is_computed),
    isLookup: toBool(field.is_lookup),
    notNull: toBool(field.not_null),
    unique: toBool(field.unique_value),
    cellValueType,
    isMultipleCellValue,
    dbFieldType,
    dbFieldName: field.id.replace(/\W/g, '_').slice(0, 63),
    recordRead: true,
    recordCreate: true,
  };
};

const normalizeColumnMeta = (columnMeta: unknown): IViewVo['columnMeta'] => {
  if (!Array.isArray(columnMeta)) {
    return (columnMeta ?? {}) as IViewVo['columnMeta'];
  }

  return columnMeta.reduce<IViewVo['columnMeta']>((acc, item) => {
    const entry = item as { fieldId?: string; columnMeta?: unknown };
    if (entry.fieldId) {
      acc[entry.fieldId] = (entry.columnMeta ?? {}) as IViewVo['columnMeta'][string];
    }
    return acc;
  }, {});
};

const normalizeColumnMetaPatch = (
  currentColumnMeta: unknown,
  patch: ColumnMetaBody
): IViewVo['columnMeta'] => {
  const current = normalizeColumnMeta(currentColumnMeta) ?? {};
  const patchEntries: ColumnMetaPatchEntry[] | undefined = Array.isArray(patch)
    ? patch
    : Array.isArray((patch as ViewBody).columnMeta)
      ? ((patch as ViewBody).columnMeta as ColumnMetaPatchEntry[])
      : undefined;

  if (patchEntries) {
    return patchEntries.reduce<IViewVo['columnMeta']>(
      (acc, item) => {
        if (!item.fieldId) return acc;
        const patchMeta =
          item.columnMeta && typeof item.columnMeta === 'object' && !Array.isArray(item.columnMeta)
            ? item.columnMeta
            : {};
        acc[item.fieldId] = {
          ...(acc[item.fieldId] ?? {}),
          ...patchMeta,
        } as IViewVo['columnMeta'][string];
        return acc;
      },
      { ...current }
    );
  }

  const nextColumnMeta = (patch as ViewBody).columnMeta ?? patch;
  return {
    ...current,
    ...normalizeColumnMeta(nextColumnMeta),
  };
};

const normalizeSort = (sort: unknown): IViewVo['sort'] => {
  if (!sort) return undefined;
  if (Array.isArray(sort)) return { sortObjs: sort } as IViewVo['sort'];
  const sortValue = sort as { sortObjs?: unknown };
  if (Array.isArray(sortValue.sortObjs)) return sort as IViewVo['sort'];
  return undefined;
};

const normalizeGroup = (group: unknown): IViewVo['group'] =>
  Array.isArray(group) ? (group as IViewVo['group']) : undefined;

const toTeableView = (view: LocalView | null | undefined): IViewVo | null => {
  if (!view) return null;
  return {
    id: view.id,
    name: view.name,
    type: (view.type ?? ViewType.Grid) as IViewVo['type'],
    description: view.description ?? undefined,
    order: view.sort_order ?? 0,
    options: (view.options ?? {}) as IViewVo['options'],
    columnMeta: normalizeColumnMeta(view.columnMeta),
    filter: view.filter as IViewVo['filter'],
    sort: normalizeSort(view.sort),
    group: normalizeGroup(view.group),
    isLocked: false,
    createdBy: 'usr_mochi_local',
    createdTime: view.created_time ?? new Date(0).toISOString(),
    lastModifiedTime: view.last_modified_time ?? undefined,
  };
};

const toTeableRecord = (record: LocalRecord | null | undefined): IRecord | null => {
  if (!record) return null;
  return {
    id: record.id,
    fields: record.fields ?? {},
    autoNumber: record.auto_number,
    createdTime: record.created_time,
    lastModifiedTime: record.last_modified_time,
    createdBy: record.created_by ?? 'usr_mochi_local',
    lastModifiedBy: record.last_modified_by ?? record.created_by ?? 'usr_mochi_local',
  };
};

const getAttachmentId = (attachment: unknown) =>
  isObjectRecord(attachment) && typeof attachment.id === 'string' ? attachment.id : undefined;

const insertAttachmentsAtAnchor = (
  currentValue: unknown,
  attachments: IAttachmentItem[],
  anchorId?: string
) => {
  const current = Array.isArray(currentValue) ? [...currentValue] : [];
  if (!attachments.length) return current;

  const anchorIndex = anchorId
    ? current.findIndex((attachment) => getAttachmentId(attachment) === anchorId)
    : -1;
  const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : current.length;
  return [
    ...current.slice(0, insertIndex),
    ...attachments,
    ...current.slice(insertIndex),
  ] as IAttachmentItem[];
};

const toRecordHistoryVo = (history: {
  rows: unknown[];
  nextCursor: string | null;
}): LocalRecordHistoryVo => ({
  historyList: (history.rows as LocalRecordHistoryRow[]).map((row) => {
    const meta = toTeableField(row.field);
    return {
      id: row.id,
      tableId: row.table_id,
      recordId: row.record_id,
      fieldId: row.field_id,
      before: { meta, data: row.before },
      after: { meta, data: row.after },
      createdTime: row.created_time,
      createdBy: 'usr_mochi_local',
    };
  }),
  userMap: {
    usr_mochi_local: {
      id: 'usr_mochi_local',
      name: 'Mochi Local',
      email: 'mochi-local@example.local',
      avatar: null,
    },
  },
  nextCursor: history.nextCursor,
});

@Public()
@Controller('api/table')
export class MochiTeableApiController {
  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  private listLocalRecordsForQuery(
    tableId: string,
    query: Record<string, unknown>,
    options: { paginate?: boolean } = {}
  ): LocalRecord[] {
    const take = options.paginate ? parseNumberQuery(getQueryValue(query, 'take'), 100) : 100000;
    const skip = options.paginate ? parseNumberQuery(getQueryValue(query, 'skip'), 0) : 0;
    const selectedRecordIds = parseJsonArrayQuery(getQueryValue(query, 'selectedRecordIds'));
    const filterLinkCellSelected = parseLinkCellQuery(
      getQueryValue(query, 'filterLinkCellSelected')
    );
    const filterLinkCellCandidate = parseLinkCellQuery(
      getQueryValue(query, 'filterLinkCellCandidate')
    );
    const hasLinkCellQuery =
      Boolean(selectedRecordIds?.length) ||
      Boolean(filterLinkCellSelected) ||
      Boolean(filterLinkCellCandidate);
    const records = this.mochiSqliteService.listRecords(tableId, {
      search: normalizeSearchQuery(getQueryValue(query, 'search')),
      limit: hasLinkCellQuery ? 100000 : take,
      offset: hasLinkCellQuery ? 0 : skip,
      filters: normalizeFilterQuery(getQueryValue(query, 'filter')),
      sorts: normalizeSortQuery(getQueryValue(query, 'orderBy')),
    }) as LocalRecord[];
    const filteredRecords = this.applyLinkCellQuery(records, {
      selectedRecordIds,
      filterLinkCellSelected,
      filterLinkCellCandidate,
    });

    return hasLinkCellQuery && options.paginate
      ? filteredRecords.slice(skip, skip + take)
      : filteredRecords;
  }

  private applyLinkCellQuery(
    records: LocalRecord[],
    query: {
      selectedRecordIds?: string[];
      filterLinkCellSelected?: string | [string, string];
      filterLinkCellCandidate?: string | [string, string];
    }
  ): LocalRecord[] {
    const selectedRecordIds = query.selectedRecordIds ?? [];
    const selectedSet = new Set(selectedRecordIds);

    if (query.filterLinkCellSelected) {
      const linkedRecordIds = this.getLinkedRecordIds(query.filterLinkCellSelected);
      const ids = linkedRecordIds.length ? linkedRecordIds : selectedRecordIds;
      const idOrder = new Map(ids.map((id, index) => [id, index]));
      return uniqueRecords(records)
        .filter((record) => idOrder.has(record.id))
        .sort((left, right) => (idOrder.get(left.id) ?? 0) - (idOrder.get(right.id) ?? 0));
    }

    if (query.filterLinkCellCandidate) {
      const excludedIds = new Set([
        ...selectedRecordIds,
        ...this.getLinkedRecordIds(query.filterLinkCellCandidate),
      ]);
      return uniqueRecords(records).filter((record) => !excludedIds.has(record.id));
    }

    if (selectedSet.size) {
      const idOrder = new Map(selectedRecordIds.map((id, index) => [id, index]));
      return uniqueRecords(records)
        .filter((record) => selectedSet.has(record.id))
        .sort((left, right) => (idOrder.get(left.id) ?? 0) - (idOrder.get(right.id) ?? 0));
    }

    return records;
  }

  private getLinkedRecordIds(linkCellQuery: string | [string, string]): string[] {
    if (!Array.isArray(linkCellQuery)) return [];
    const [fieldId, recordId] = linkCellQuery;
    const record = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
    return getLinkRecordIds(record?.fields?.[fieldId]);
  }

  private prepareSelectionStream(response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
  }

  private sendSelectionStreamEvent(response: Response, event: Record<string, unknown>) {
    if (response.writableEnded || response.destroyed) return;
    response.write(`data: ${JSON.stringify(event)}\n\n`);
    (response as Response & { flush?: () => void }).flush?.();
  }

  private finishSelectionStream(response: Response) {
    if (!response.writableEnded && !response.destroyed) {
      response.end();
    }
  }

  private runUndoRedo(tableId: string, mode: UndoRedoMode): UndoRedoResponse {
    try {
      const batch =
        mode === 'undo'
          ? this.mochiSqliteService.undo(tableId)
          : this.mochiSqliteService.redo(tableId);
      return { status: batch ? 'fulfilled' : 'empty' };
    } catch (error) {
      return {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : `${mode} failed`,
      };
    }
  }

  private streamUndoRedo(tableId: string, mode: UndoRedoMode, response: Response) {
    this.prepareSelectionStream(response);
    try {
      this.sendSelectionStreamEvent(response, {
        id: 'progress',
        mode,
        phase: 'preparing',
        totalCount: 1,
        processedCount: 0,
        engine: 'v1',
      });

      const result = this.runUndoRedo(tableId, mode);

      if (result.status === 'failed') {
        this.sendSelectionStreamEvent(response, {
          id: 'error',
          mode,
          message: result.errorMessage ?? `${mode} failed`,
          engine: 'v1',
        });
        return;
      }

      this.sendSelectionStreamEvent(response, {
        id: 'done',
        mode,
        status: result.status,
        engine: 'v1',
      });
    } finally {
      this.finishSelectionStream(response);
    }
  }

  private listSelectionRecords(
    tableId: string,
    query?: { filter?: string | unknown[] | Record<string, unknown>; orderBy?: string | unknown[] }
  ) {
    return this.mochiSqliteService.listRecords(tableId, {
      limit: 100000,
      filters: normalizeFilterQuery(query?.filter),
      sorts: normalizeSortQuery(query?.orderBy),
    }) as LocalRecord[];
  }

  private rangeSelectionToIds(
    tableId: string,
    ranges: [number, number][],
    type?: RangeType,
    query?: { filter?: string | unknown[] | Record<string, unknown>; orderBy?: string | unknown[] }
  ) {
    const records = this.listSelectionRecords(tableId, query);
    const fields = this.mochiSqliteService.listFields(tableId) as LocalField[];
    const recordIndexes = unique(
      ranges.flatMap(([first, second], index) => {
        if (type === 'rows') return expandIndexRange(first, second, records.length);
        if (type === 'columns') return [];
        if (index % 2 === 0) {
          const end = ranges[index + 1]?.[1] ?? second;
          return expandIndexRange(second, end, records.length);
        }
        return [];
      })
    );
    const fieldIndexes = unique(
      ranges.flatMap(([first, second], index) => {
        if (type === 'columns') return expandIndexRange(first, second, fields.length);
        if (type === 'rows') return [];
        if (index % 2 === 0) {
          const end = ranges[index + 1]?.[0] ?? first;
          return expandIndexRange(first, end, fields.length);
        }
        return [];
      })
    );

    return {
      records,
      fields,
      recordIds: recordIndexes.map((index) => records[index]?.id).filter(Boolean),
      fieldIds: fieldIndexes.map((index) => fields[index]?.id).filter(Boolean),
    };
  }

  private bodySelectionToIds(tableId: string, body: SelectionIdBody) {
    const allRecords = this.listSelectionRecords(tableId, body);
    const allFields = this.mochiSqliteService.listFields(tableId) as LocalField[];
    const excluded = new Set(body.selection?.excludeRecordIds ?? []);
    const recordIds =
      body.selection?.recordIds ??
      allRecords.map((record) => record.id).filter((recordId) => !excluded.has(recordId));
    const fieldIds =
      body.selection?.fieldIds ?? body.projection ?? allFields.map((field) => field.id);

    return {
      records: allRecords,
      fields: allFields,
      recordIds,
      fieldIds,
    };
  }

  private copyByIds(
    records: LocalRecord[],
    fields: LocalField[],
    recordIds: string[],
    fieldIds: string[]
  ) {
    const recordById = new Map(records.map((record) => [record.id, record]));
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const selectedFields = fieldIds
      .map((fieldId) => fieldById.get(fieldId))
      .filter((field): field is LocalField => Boolean(field));
    return {
      header: selectedFields.map(toTeableField).filter(Boolean) as IFieldVo[],
      content: recordIds
        .map((recordId) => {
          const record = recordById.get(recordId);
          return selectedFields
            .map((field) => stringifyCopyValue(record?.fields?.[field.id]))
            .join('\t');
        })
        .join('\n'),
    };
  }

  private pasteByIds(tableId: string, body: PasteByIdBody) {
    const { fields, recordIds, fieldIds } = this.bodySelectionToIds(tableId, body);
    const pasteRows = parsePasteContent(body.content);
    const actorPatch = getActorPatch({}, body);
    const createdRecordIds: string[] = [];
    const updatedRecordIds: string[] = [];
    const targetRecordIds = [...recordIds];

    pasteRows.forEach((row, rowIndex) => {
      const recordId = targetRecordIds[rowIndex];
      const values = row.reduce<Record<string, unknown>>((acc, value, columnOffset) => {
        const fieldId = fieldIds[columnOffset];
        if (fieldId) acc[fieldId] = value;
        return acc;
      }, {});
      if (Object.keys(values).length === 0) return;

      if (recordId) {
        this.mochiSqliteService.updateRecord(recordId, { fields: values, ...actorPatch }, tableId);
        updatedRecordIds.push(recordId);
        return;
      }

      const created = this.mochiSqliteService.createRecord({
        tableId,
        fields: values,
        ...actorPatch,
      }) as LocalRecord;
      createdRecordIds.push(created.id);
      targetRecordIds.push(created.id);
    });

    return {
      selection: {
        recordIds: [...updatedRecordIds, ...createdRecordIds],
        fieldIds: fieldIds.filter((fieldId) => fields.some((field) => field.id === fieldId)),
      },
      pastedRecordIds: updatedRecordIds,
      pastedFieldIds: fieldIds,
      createdRecordIds,
      createdFieldIds: [],
      createdChoiceIdsByFieldId: {},
      createdForeignRecordIds: [],
      skippedAttachments: [],
    };
  }

  @Get(':tableId/view')
  listViews(@Param('tableId') tableId: string): IViewVo[] {
    const views = this.mochiSqliteService.listViews(tableId) as LocalView[];
    return views.map(toTeableView).filter(Boolean) as IViewVo[];
  }

  @Post(':tableId/view')
  createView(@Param('tableId') tableId: string, @Body() body: ViewBody): IViewVo | null {
    const created = this.mochiSqliteService.createView({
      tableId,
      name: body.name ?? 'Grid view',
      type: body.type ?? ViewType.Grid,
      options: body.options,
      columnMeta: body.columnMeta,
      filter: body.filter,
      sort: body.sort,
      group: body.group,
    }) as LocalView | null;
    return toTeableView(created);
  }

  @Post(':tableId/view/:viewId/duplicate')
  duplicateView(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string
  ): IViewVo | null {
    const source = this.mochiSqliteService.getView(viewId) as LocalView | null;
    if (!source) return null;
    const created = this.mochiSqliteService.createView({
      tableId,
      name: `${source.name} copy`,
      type: source.type ?? ViewType.Grid,
      options: source.options,
      columnMeta: source.columnMeta,
      filter: source.filter,
      sort: source.sort,
      group: source.group,
    }) as LocalView | null;
    return toTeableView(created);
  }

  @Delete(':tableId/view/:viewId')
  deleteView(@Param('viewId') viewId: string): null {
    this.mochiSqliteService.deleteView(viewId);
    return null;
  }

  @Put(':tableId/view/:viewId/name')
  updateViewName(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        name: body.name,
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Put(':tableId/view/:viewId/filter')
  updateViewFilter(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        filter: body.filter ?? null,
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Put(':tableId/view/:viewId/sort')
  updateViewSort(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        sort: body.sort ?? null,
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Put(':tableId/view/:viewId/group')
  updateViewGroup(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        group: body.group ?? null,
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Put(':tableId/view/:viewId/column-meta')
  updateViewColumnMeta(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ColumnMetaBody
  ): IViewVo | null {
    const current = this.mochiSqliteService.getView(viewId) as LocalView | null;
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        columnMeta: normalizeColumnMetaPatch(current?.columnMeta, body),
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Patch(':tableId/view/:viewId/options')
  updateViewOptions(
    @Param('tableId') tableId: string,
    @Param('viewId') viewId: string,
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        options: body.options ?? {},
      },
      tableId
    ) as LocalView | null;
    return toTeableView(updated);
  }

  @Get(':tableId/field')
  listFields(@Param('tableId') tableId: string): IFieldVo[] {
    const fields = this.mochiSqliteService.listFields(tableId) as LocalField[];
    return fields.map(toTeableField).filter(Boolean) as IFieldVo[];
  }

  @Post(':tableId/field/plan')
  planCreateField(): FieldPlan {
    return emptyFieldPlan();
  }

  @Post(':tableId/field')
  createField(@Param('tableId') tableId: string, @Body() body: FieldBody): IFieldVo | null {
    const type = normalizeFieldType(body.type);
    const created = this.mochiSqliteService.createField({
      tableId,
      name: body.name ?? 'New field',
      description: body.description,
      type,
      cellValueType: body.cellValueType ?? defaultCellValueTypeFor(type),
      options: body.options,
      meta: body.meta,
      aiConfig: body.aiConfig,
      isPrimary: body.isPrimary,
      isComputed: body.isComputed,
      isLookup: body.isLookup,
      notNull: body.notNull,
      unique: body.unique,
    }) as LocalField | null;
    return toTeableField(created);
  }

  @Post(':tableId/field/:fieldId/duplicate')
  duplicateField(
    @Param('tableId') tableId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: FieldBody
  ): IFieldVo | null {
    const source = this.mochiSqliteService.getField(fieldId) as LocalField | null;
    if (!source) return null;

    const created = this.mochiSqliteService.createField({
      tableId,
      name: body.name ?? `${source.name} copy`,
      description: source.description ?? undefined,
      type: source.type,
      cellValueType: source.cell_value_type,
      options: source.options,
      meta: source.meta,
      aiConfig: source.aiConfig,
      isComputed: toBool(source.is_computed),
      isLookup: toBool(source.is_lookup),
      notNull: toBool(source.not_null),
      unique: toBool(source.unique_value),
      order: (source.sort_order ?? 0) + 0.5,
    }) as LocalField | null;

    if (created) {
      const records = this.mochiSqliteService.listRecords(tableId, {
        limit: 100000,
      }) as LocalRecord[];
      for (const record of records) {
        if (!record.id) continue;
        this.mochiSqliteService.updateRecord(
          record.id,
          { fields: { [created.id]: record.fields?.[fieldId] ?? null } },
          tableId
        );
      }
    }

    return toTeableField(created);
  }

  @Patch(':tableId/field/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body() body: FieldBody): IFieldVo | null {
    const updated = this.mochiSqliteService.updateField(fieldId, body) as LocalField | null;
    return toTeableField(updated);
  }

  @Get(':tableId/field/:fieldId/plan')
  planField(): FieldPlan {
    return emptyFieldPlan();
  }

  @Put(':tableId/field/:fieldId/plan')
  planConvertField(): FieldPlan {
    return emptyFieldPlan();
  }

  @Put(':tableId/field/:fieldId/convert')
  convertField(@Param('fieldId') fieldId: string, @Body() body: FieldBody): IFieldVo | null {
    const type = normalizeFieldType(body.type);
    const updated = this.mochiSqliteService.updateField(fieldId, {
      ...body,
      type,
      cellValueType: body.cellValueType ?? defaultCellValueTypeFor(type),
    }) as LocalField | null;
    return toTeableField(updated);
  }

  @Delete(':tableId/field/:fieldId/plan')
  planDeleteField(): FieldPlan {
    return emptyFieldPlan();
  }

  @Delete(':tableId/field')
  deleteFields(@Query('fieldIds') fieldIds?: string | string[]): null {
    const ids = Array.isArray(fieldIds) ? fieldIds : fieldIds ? [fieldIds] : [];
    ids.forEach((fieldId) => this.mochiSqliteService.deleteField(fieldId));
    return null;
  }

  @Delete(':tableId/field/:fieldId')
  deleteField(@Param('fieldId') fieldId: string): null {
    this.mochiSqliteService.deleteField(fieldId);
    return null;
  }

  @Get(':tableId/aggregation/row-count')
  getRowCount(
    @Param('tableId') tableId: string,
    @Query() query: Record<string, unknown>
  ): { rowCount: number } {
    const records = this.listLocalRecordsForQuery(tableId, query);
    return { rowCount: records.length };
  }

  @Get(':tableId/aggregation')
  getAggregation(): { aggregations: [] } {
    return { aggregations: [] };
  }

  @Get(':tableId/aggregation/task-status-collection')
  getTaskStatusCollection(): { cells: []; fieldMap: Record<string, never> } {
    return { cells: [], fieldMap: {} };
  }

  @Get(':tableId/record')
  listRecords(
    @Param('tableId') tableId: string,
    @Query() query: Record<string, unknown>
  ): { records: IRecord[] } {
    const records = this.listLocalRecordsForQuery(tableId, query, { paginate: true });
    return { records: records.map(toTeableRecord).filter(Boolean) as IRecord[] };
  }

  @Get(':tableId/record/history')
  getRecordListHistory(
    @Param('tableId') tableId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('fieldIds') fieldIds?: string | string[],
    @Query('createdByIds') createdByIds?: string | string[],
    @Query('cursor') cursor?: string
  ): LocalRecordHistoryVo {
    return toRecordHistoryVo(
      this.mochiSqliteService.listRecordHistory(tableId, {
        startDate,
        endDate,
        fieldIds: parseArrayQuery(fieldIds),
        createdByIds: parseArrayQuery(createdByIds),
        cursor,
      })
    );
  }

  @Get(':tableId/record/:recordId/history')
  getRecordHistory(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('fieldIds') fieldIds?: string | string[],
    @Query('createdByIds') createdByIds?: string | string[],
    @Query('cursor') cursor?: string
  ): LocalRecordHistoryVo {
    return toRecordHistoryVo(
      this.mochiSqliteService.listRecordHistory(tableId, {
        recordId,
        startDate,
        endDate,
        fieldIds: parseArrayQuery(fieldIds),
        createdByIds: parseArrayQuery(createdByIds),
        cursor,
      })
    );
  }

  @Post(':tableId/record')
  createRecords(
    @Param('tableId') tableId: string,
    @Body() body: CreateRecordsBody,
    @Headers() headers: Record<string, string | string[] | undefined>
  ): { records: IRecord[] } {
    const actorPatch = getActorPatch(headers, body);
    const records = body.records?.length ? body.records : [{ fields: {} }];
    const created = records.map((record) =>
      this.mochiSqliteService.createRecord({
        tableId,
        fields: record.fields ?? {},
        order: body.order,
        ...actorPatch,
      })
    ) as LocalRecord[];
    return { records: created.map(toTeableRecord).filter(Boolean) as IRecord[] };
  }

  @Post(':tableId/record/:recordId/duplicate')
  duplicateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() order?: unknown,
    @Headers() headers?: Record<string, string | string[] | undefined>
  ): IRecord | null {
    const source = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
    if (!source) return null;
    const created = this.mochiSqliteService.createRecord({
      tableId,
      fields: { ...(source.fields ?? {}) },
      order,
      ...getActorPatch(headers ?? {}),
    }) as LocalRecord;
    return toTeableRecord(created);
  }

  @Patch(':tableId/record/:recordId')
  updateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() body: UpdateRecordBody,
    @Headers() headers: Record<string, string | string[] | undefined>
  ): IRecord | null {
    const fields = body.record?.fields ?? body.fields ?? {};
    const updated = this.mochiSqliteService.updateRecord(
      recordId,
      {
        fields,
        order: body.order,
        ...getActorPatch(headers, body),
      },
      tableId
    ) as LocalRecord | null;
    return toTeableRecord(updated);
  }

  @Post(':tableId/record/:recordId/:fieldId/insertAttachment')
  insertAttachment(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: InsertAttachmentBody = {},
    @Headers() headers: Record<string, string | string[] | undefined>
  ): IRecord | null {
    const record = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
    if (!record) return null;

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const nextValue = insertAttachmentsAtAnchor(
      record.fields?.[fieldId],
      attachments,
      body.anchorId
    );
    const updated = this.mochiSqliteService.updateRecord(
      recordId,
      {
        fields: {
          [fieldId]: nextValue,
        },
        ...getActorPatch(headers, body),
      },
      tableId
    ) as LocalRecord | null;
    return toTeableRecord(updated);
  }

  @Delete(':tableId/record/:recordId')
  deleteRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string
  ): IRecord | null {
    const deleted = this.mochiSqliteService.deleteRecord(recordId, tableId) as LocalRecord | null;
    return toTeableRecord(deleted);
  }

  @Post(':tableId/undo-redo/undo')
  undo(@Param('tableId') tableId: string): UndoRedoResponse {
    return this.runUndoRedo(tableId, 'undo');
  }

  @Post(':tableId/undo-redo/redo')
  redo(@Param('tableId') tableId: string): UndoRedoResponse {
    return this.runUndoRedo(tableId, 'redo');
  }

  @Post(':tableId/undo-redo/undo-stream')
  undoStream(@Param('tableId') tableId: string, @Res() response: Response): void {
    this.streamUndoRedo(tableId, 'undo', response);
  }

  @Post(':tableId/undo-redo/redo-stream')
  redoStream(@Param('tableId') tableId: string, @Res() response: Response): void {
    this.streamUndoRedo(tableId, 'redo', response);
  }

  @Get(':tableId/selection/range-to-id')
  rangeToId(
    @Param('tableId') tableId: string,
    @Query('ranges') rangesQuery: string,
    @Query('type') type?: RangeType,
    @Query('returnType') returnType: IdReturnType = 'all',
    @Query('filter') filter?: string,
    @Query('orderBy') orderBy?: string
  ): { recordIds?: string[]; fieldIds?: string[] } {
    const ranges = parseRangesQuery(rangesQuery);
    const selection = this.rangeSelectionToIds(tableId, ranges, type, { filter, orderBy });
    const result: { recordIds?: string[]; fieldIds?: string[] } = {};

    if (returnType === 'recordId' || returnType === 'all') {
      result.recordIds = selection.recordIds;
    }

    if (returnType === 'fieldId' || returnType === 'all') {
      result.fieldIds = selection.fieldIds;
    }

    return result;
  }

  @Get(':tableId/selection/copy')
  copySelection(
    @Param('tableId') tableId: string,
    @Query('ranges') rangesQuery: string,
    @Query('type') type?: RangeType,
    @Query('filter') filter?: string,
    @Query('orderBy') orderBy?: string
  ): { content: string; header: IFieldVo[] } {
    const selection = this.rangeSelectionToIds(tableId, parseRangesQuery(rangesQuery), type, {
      filter,
      orderBy,
    });
    return this.copyByIds(
      selection.records,
      selection.fields,
      selection.recordIds,
      selection.fieldIds
    );
  }

  @Post(':tableId/selection/copy-by-id')
  copySelectionById(
    @Param('tableId') tableId: string,
    @Body() body: SelectionIdBody
  ): { content: string; header: IFieldVo[] } {
    const selection = this.bodySelectionToIds(tableId, body);
    return this.copyByIds(
      selection.records,
      selection.fields,
      selection.recordIds,
      selection.fieldIds
    );
  }

  @Patch(':tableId/selection/temporaryPaste')
  temporaryPaste(
    @Param('tableId') tableId: string,
    @Body() body: TemporaryPasteBody
  ): Array<{ fields: Record<string, unknown> }> {
    const fields = this.mochiSqliteService.listFields(tableId) as LocalField[];
    const startColumnIndex = body.ranges?.[0]?.[0] ?? 0;
    const pasteRows = parsePasteContent(body.content);

    return pasteRows.map((row) => ({
      fields: row.reduce<Record<string, unknown>>((acc, value, columnOffset) => {
        const field = fields[startColumnIndex + columnOffset];
        if (field) {
          acc[field.id] = value;
        }
        return acc;
      }, {}),
    }));
  }

  @Patch(':tableId/selection/paste-by-id')
  pasteSelectionById(@Param('tableId') tableId: string, @Body() body: PasteByIdBody) {
    return this.pasteByIds(tableId, body);
  }

  @Patch(':tableId/selection/paste-by-id-stream')
  pasteSelectionByIdStream(
    @Param('tableId') tableId: string,
    @Body() body: PasteByIdBody,
    @Res() response: Response
  ): void {
    const totalCount = Math.max(
      parsePasteContent(body.content).length,
      body.selection?.recordIds?.length ?? 0
    );

    this.prepareSelectionStream(response);
    try {
      this.sendSelectionStreamEvent(response, {
        id: 'progress',
        phase: 'preparing',
        batchIndex: -1,
        totalCount,
        processedCount: 0,
        updatedCount: 0,
        createdCount: 0,
        batchProcessedCount: 0,
      });

      const result = this.pasteByIds(tableId, body);
      const updatedCount = result.pastedRecordIds.length;
      const createdCount = result.createdRecordIds.length;

      this.sendSelectionStreamEvent(response, {
        id: 'done',
        totalCount,
        processedCount: totalCount,
        updatedCount,
        createdCount,
        data: {
          updatedCount,
          createdCount,
          createdRecordIds: result.createdRecordIds,
          pastedRecordIds: result.pastedRecordIds,
          pastedFieldIds: result.pastedFieldIds,
          createdFieldIds: result.createdFieldIds,
          createdChoiceIdsByFieldId: result.createdChoiceIdsByFieldId,
          createdForeignRecordIds: result.createdForeignRecordIds,
          skippedAttachments: result.skippedAttachments,
          selection: result.selection,
        },
      });
    } catch (error) {
      this.sendSelectionStreamEvent(response, {
        id: 'error',
        phase: 'pasting',
        batchIndex: -1,
        totalCount,
        processedCount: 0,
        updatedCount: 0,
        createdCount: 0,
        recordIds: body.selection?.recordIds ?? [],
        message: error instanceof Error ? error.message : 'Paste selection by id stream failed',
      });
    } finally {
      this.finishSelectionStream(response);
    }
  }

  @Patch(':tableId/selection/paste')
  pasteSelection(
    @Param('tableId') tableId: string,
    @Body() body: RangeBody
  ): { ranges: [[number, number], [number, number]] } {
    const selection = this.rangeSelectionToIds(tableId, body.ranges ?? [[0, 0]], undefined, body);
    this.pasteByIds(tableId, {
      content: body.content,
      selection: {
        recordIds: selection.recordIds,
        fieldIds: selection.fieldIds,
      },
    });
    const pasteRows = parsePasteContent(body.content);
    const rowCount = Math.max(1, pasteRows.length);
    const columnCount = Math.max(1, pasteRows[0]?.length ?? 1);
    const start = body.ranges?.[0] ?? [0, 0];
    return {
      ranges: [start, [start[0] + columnCount - 1, start[1] + rowCount - 1]],
    };
  }

  @Get(':tableId/selection/duplicate-stream')
  duplicateSelectionStream(
    @Param('tableId') tableId: string,
    @Query('ranges') rangesQuery: string,
    @Query('type') type: RangeType | undefined,
    @Query('filter') filter: string | undefined,
    @Query('orderBy') orderBy: string | undefined,
    @Res() response: Response
  ): void {
    const selection = this.rangeSelectionToIds(tableId, parseRangesQuery(rangesQuery), type, {
      filter,
      orderBy,
    });
    const totalCount = selection.recordIds.length;
    const duplicatedRecordIds: string[] = [];

    this.prepareSelectionStream(response);
    try {
      this.sendSelectionStreamEvent(response, {
        id: 'progress',
        phase: 'preparing',
        batchIndex: -1,
        totalCount,
        duplicatedCount: 0,
        batchDuplicatedCount: 0,
      });

      for (const recordId of selection.recordIds) {
        const source = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
        if (!source) continue;
        const created = this.mochiSqliteService.createRecord({
          tableId,
          fields: { ...(source.fields ?? {}) },
        }) as LocalRecord;
        duplicatedRecordIds.push(created.id);
      }

      this.sendSelectionStreamEvent(response, {
        id: 'done',
        totalCount,
        duplicatedCount: duplicatedRecordIds.length,
        data: {
          duplicatedCount: duplicatedRecordIds.length,
          duplicatedRecordIds,
        },
      });
    } catch (error) {
      this.sendSelectionStreamEvent(response, {
        id: 'error',
        phase: 'duplicating',
        batchIndex: -1,
        totalCount,
        duplicatedCount: duplicatedRecordIds.length,
        recordIds: selection.recordIds,
        message: error instanceof Error ? error.message : 'Duplicate selection stream failed',
      });
    } finally {
      this.finishSelectionStream(response);
    }
  }

  @Patch(':tableId/selection/clear-by-id')
  clearSelectionById(@Param('tableId') tableId: string, @Body() body: SelectionIdBody): null {
    const selection = this.bodySelectionToIds(tableId, body);
    const actorPatch = getActorPatch({}, body);
    for (const recordId of selection.recordIds) {
      const fields = selection.fieldIds.reduce<Record<string, unknown>>((acc, fieldId) => {
        acc[fieldId] = null;
        return acc;
      }, {});
      this.mochiSqliteService.updateRecord(recordId, { fields, ...actorPatch }, tableId);
    }
    return null;
  }

  @Patch(':tableId/selection/clear-by-id-stream')
  clearSelectionByIdStream(
    @Param('tableId') tableId: string,
    @Body() body: SelectionIdBody,
    @Res() response: Response
  ): void {
    const selection = this.bodySelectionToIds(tableId, body);
    const totalCount = selection.recordIds.length;

    this.prepareSelectionStream(response);
    try {
      this.sendSelectionStreamEvent(response, {
        id: 'progress',
        phase: 'preparing',
        batchIndex: -1,
        totalCount,
        processedCount: 0,
        clearedCount: 0,
        batchProcessedCount: 0,
        batchClearedCount: 0,
      });

      this.clearSelectionById(tableId, {
        selection: {
          recordIds: selection.recordIds,
          fieldIds: selection.fieldIds,
        },
        actorId: body.actorId,
        source: body.source,
      });

      this.sendSelectionStreamEvent(response, {
        id: 'done',
        totalCount,
        processedCount: totalCount,
        clearedCount: totalCount,
        data: {
          clearedCount: totalCount,
          clearedRecordIds: selection.recordIds,
        },
      });
    } catch (error) {
      this.sendSelectionStreamEvent(response, {
        id: 'error',
        phase: 'clearing',
        batchIndex: -1,
        totalCount,
        processedCount: 0,
        clearedCount: 0,
        recordIds: selection.recordIds,
        message: error instanceof Error ? error.message : 'Clear selection by id stream failed',
      });
    } finally {
      this.finishSelectionStream(response);
    }
  }

  @Patch(':tableId/selection/clear')
  clearSelection(@Param('tableId') tableId: string, @Body() body: RangeBody): null {
    const selection = this.rangeSelectionToIds(tableId, body.ranges ?? [], undefined, body);
    return this.clearSelectionById(tableId, {
      selection: {
        recordIds: selection.recordIds,
        fieldIds: selection.fieldIds,
      },
      actorId: body.actorId,
      source: body.source,
    });
  }

  @Post(':tableId/selection/delete-by-id')
  deleteSelectionById(
    @Param('tableId') tableId: string,
    @Body() body: SelectionIdBody
  ): { ids: string[] } {
    const ids = body.selection?.recordIds ?? [];
    ids.forEach((recordId) => this.mochiSqliteService.deleteRecord(recordId, tableId));
    return { ids };
  }

  @Patch(':tableId/selection/delete-by-id-stream')
  deleteSelectionByIdStream(
    @Param('tableId') tableId: string,
    @Body() body: SelectionIdBody,
    @Res() response: Response
  ): void {
    const ids = body.selection?.recordIds ?? [];
    const totalCount = ids.length;

    this.prepareSelectionStream(response);
    try {
      this.sendSelectionStreamEvent(response, {
        id: 'progress',
        phase: 'preparing',
        batchIndex: -1,
        totalCount,
        deletedCount: 0,
        batchDeletedCount: 0,
      });

      ids.forEach((recordId) => this.mochiSqliteService.deleteRecord(recordId, tableId));

      this.sendSelectionStreamEvent(response, {
        id: 'done',
        totalCount,
        deletedCount: totalCount,
        data: {
          deletedCount: totalCount,
          deletedRecordIds: ids,
        },
      });
    } catch (error) {
      this.sendSelectionStreamEvent(response, {
        id: 'error',
        phase: 'deleting',
        batchIndex: -1,
        totalCount,
        deletedCount: 0,
        recordIds: ids,
        message: error instanceof Error ? error.message : 'Delete selection by id stream failed',
      });
    } finally {
      this.finishSelectionStream(response);
    }
  }

  @Delete(':tableId/selection/delete')
  deleteSelection(
    @Param('tableId') tableId: string,
    @Query('ranges') rangesQuery: string,
    @Query('type') type?: RangeType,
    @Query('filter') filter?: string,
    @Query('orderBy') orderBy?: string
  ): { ids: string[] } {
    const selection = this.rangeSelectionToIds(tableId, parseRangesQuery(rangesQuery), type, {
      filter,
      orderBy,
    });
    selection.recordIds.forEach((recordId) =>
      this.mochiSqliteService.deleteRecord(recordId, tableId)
    );
    return { ids: selection.recordIds };
  }
}

@Public()
@Controller('api/share')
export class MochiLocalShareViewController {
  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  private getShareViewContext(linkFieldId: string) {
    const linkField = this.mochiSqliteService.getField(linkFieldId) as LocalField | null;
    const options =
      linkField?.options &&
      typeof linkField.options === 'object' &&
      !Array.isArray(linkField.options)
        ? (linkField.options as Record<string, unknown>)
        : {};
    const tableId =
      typeof options.foreignTableId === 'string'
        ? options.foreignTableId
        : typeof linkField?.table_id === 'string'
          ? linkField.table_id
          : undefined;
    if (!linkField || !tableId) {
      throw new NotFoundException('Local link view not found');
    }

    const fields = this.mochiSqliteService
      .listFields(tableId)
      .map((field) => toTeableField(field as LocalField))
      .filter(Boolean) as IFieldVo[];
    const view = (this.mochiSqliteService.listViews(tableId) as LocalView[])[0];
    const records = this.listRecords(tableId, { take: '50' }, { paginate: true })
      .map(toTeableRecord)
      .filter(Boolean) as IRecord[];

    return {
      shareId: linkFieldId,
      tableId,
      viewId: view?.id,
      view: toTeableView(view) ?? undefined,
      fields,
      records,
    };
  }

  private listRecords(
    tableId: string,
    query: Record<string, unknown>,
    options: { paginate?: boolean } = {}
  ): LocalRecord[] {
    const take = options.paginate ? parseNumberQuery(getQueryValue(query, 'take'), 100) : 100000;
    const skip = options.paginate ? parseNumberQuery(getQueryValue(query, 'skip'), 0) : 0;
    const selectedRecordIds = parseJsonArrayQuery(getQueryValue(query, 'selectedRecordIds'));
    const filterLinkCellSelected = parseLinkCellQuery(
      getQueryValue(query, 'filterLinkCellSelected')
    );
    const filterLinkCellCandidate = parseLinkCellQuery(
      getQueryValue(query, 'filterLinkCellCandidate')
    );
    const hasLinkCellQuery =
      Boolean(selectedRecordIds?.length) ||
      Boolean(filterLinkCellSelected) ||
      Boolean(filterLinkCellCandidate);
    const records = this.mochiSqliteService.listRecords(tableId, {
      search: normalizeSearchQuery(getQueryValue(query, 'search')),
      limit: hasLinkCellQuery ? 100000 : take,
      offset: hasLinkCellQuery ? 0 : skip,
      filters: normalizeFilterQuery(getQueryValue(query, 'filter')),
      sorts: normalizeSortQuery(getQueryValue(query, 'orderBy')),
    }) as LocalRecord[];
    const filteredRecords = this.applyLinkCellQuery(records, {
      selectedRecordIds,
      filterLinkCellSelected,
      filterLinkCellCandidate,
    });

    return hasLinkCellQuery && options.paginate
      ? filteredRecords.slice(skip, skip + take)
      : filteredRecords;
  }

  private applyLinkCellQuery(
    records: LocalRecord[],
    query: {
      selectedRecordIds?: string[];
      filterLinkCellSelected?: string | [string, string];
      filterLinkCellCandidate?: string | [string, string];
    }
  ): LocalRecord[] {
    const selectedRecordIds = query.selectedRecordIds ?? [];

    if (query.filterLinkCellSelected) {
      const linkedRecordIds = this.getLinkedRecordIds(query.filterLinkCellSelected);
      const ids = linkedRecordIds.length ? linkedRecordIds : selectedRecordIds;
      const idOrder = new Map(ids.map((id, index) => [id, index]));
      return uniqueRecords(records)
        .filter((record) => idOrder.has(record.id))
        .sort((left, right) => (idOrder.get(left.id) ?? 0) - (idOrder.get(right.id) ?? 0));
    }

    if (query.filterLinkCellCandidate) {
      const excludedIds = new Set([
        ...selectedRecordIds,
        ...this.getLinkedRecordIds(query.filterLinkCellCandidate),
      ]);
      return uniqueRecords(records).filter((record) => !excludedIds.has(record.id));
    }

    if (selectedRecordIds.length) {
      const selectedSet = new Set(selectedRecordIds);
      const idOrder = new Map(selectedRecordIds.map((id, index) => [id, index]));
      return uniqueRecords(records)
        .filter((record) => selectedSet.has(record.id))
        .sort((left, right) => (idOrder.get(left.id) ?? 0) - (idOrder.get(right.id) ?? 0));
    }

    return records;
  }

  private getLinkedRecordIds(linkCellQuery: string | [string, string]): string[] {
    if (!Array.isArray(linkCellQuery)) return [];
    const [fieldId, recordId] = linkCellQuery;
    const record = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
    return getLinkRecordIds(record?.fields?.[fieldId]);
  }

  @Get(':shareId/view')
  getShareView(@Param('shareId') shareId: string) {
    return this.getShareViewContext(shareId);
  }

  @Get(':shareId/view/row-count')
  getShareViewRowCount(
    @Param('shareId') shareId: string,
    @Query() query: Record<string, unknown>
  ): { rowCount: number } {
    const { tableId } = this.getShareViewContext(shareId);
    return { rowCount: this.listRecords(tableId, query).length };
  }

  @Get(':shareId/view/records')
  getShareViewRecords(
    @Param('shareId') shareId: string,
    @Query() query: Record<string, unknown>
  ): { records: IRecord[] } {
    const { tableId } = this.getShareViewContext(shareId);
    const records = this.listRecords(tableId, query, { paginate: true });
    return { records: records.map(toTeableRecord).filter(Boolean) as IRecord[] };
  }
}
