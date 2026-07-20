import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { IFieldVo, IRecord, IViewVo } from '@teable/core';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MochiSqliteService } from './mochi-sqlite.service';

const CellValueType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  DateTime: 'dateTime',
} as const;

type CellValueType = (typeof CellValueType)[keyof typeof CellValueType];

const DbFieldType = {
  Text: 'TEXT',
  DateTime: 'DATETIME',
  Real: 'REAL',
  Boolean: 'BOOLEAN',
} as const;

const FieldType = {
  SingleLineText: 'singleLineText',
  Attachment: 'attachment',
  Checkbox: 'checkbox',
  Date: 'date',
  MultipleSelect: 'multipleSelect',
  Number: 'number',
  SingleSelect: 'singleSelect',
} as const;

const ViewType = {
  Grid: 'grid',
} as const;

type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType];
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

const parseArrayQuery = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.length > 0) return [value];
  return undefined;
};

const normalizeSearchQuery = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  if (typeof value === 'string') return value;
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

type UpdateRecordBody = {
  fieldKeyType?: FieldKeyType;
  fields?: Record<string, unknown>;
  record?: {
    fields?: Record<string, unknown>;
  };
  order?: unknown;
};

type CreateRecordsBody = {
  fieldKeyType?: FieldKeyType;
  records?: Array<{
    fields?: Record<string, unknown>;
  }>;
  order?: unknown;
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

type RangeType = 'rows' | 'columns';
type IdReturnType = 'recordId' | 'fieldId' | 'all';

type TemporaryPasteBody = {
  content?: string | unknown[][];
  ranges?: [number, number][];
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
};

type PasteByIdBody = SelectionIdBody & {
  content?: string | unknown[][];
  header?: unknown[];
};

type RangeBody = {
  ranges?: [number, number][];
  content?: string | unknown[][];
  filter?: string | unknown[] | Record<string, unknown>;
  orderBy?: string | unknown[];
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

const defaultCellValueTypeFor = (type?: string) => {
  if (type === FieldType.Number || type === 'number') return CellValueType.Number;
  if (type === FieldType.Checkbox || type === 'checkbox') return CellValueType.Boolean;
  if (type === FieldType.Date || type === 'date') return CellValueType.DateTime;
  return CellValueType.String;
};

const emptyFieldPlan = (): FieldPlan => ({
  estimateTime: 0,
  graph: { nodes: [], edges: [], combos: [] },
  updateCellCount: 0,
  linkFieldCount: 0,
});

const dbFieldTypeFor = (cellValueType: CellValueType) => {
  switch (cellValueType) {
    case CellValueType.Number:
      return DbFieldType.Real;
    case CellValueType.Boolean:
      return DbFieldType.Boolean;
    case CellValueType.DateTime:
      return DbFieldType.DateTime;
    case CellValueType.String:
    default:
      return DbFieldType.Text;
  }
};

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
  const type = Object.values(FieldType).includes(field.type as FieldTypeValue)
    ? (field.type as FieldTypeValue)
    : FieldType.SingleLineText;
  const cellValueType = normalizeCellValueType(field.cell_value_type);

  return {
    id: field.id,
    name: field.name,
    description: field.description ?? undefined,
    type: type as IFieldVo['type'],
    options: normalizeFieldOptions(type, field.options),
    meta: field.meta as IFieldVo['meta'],
    aiConfig: field.aiConfig as IFieldVo['aiConfig'],
    isPrimary: toBool(field.is_primary),
    isComputed: toBool(field.is_computed),
    isLookup: toBool(field.is_lookup),
    notNull: toBool(field.not_null),
    unique: toBool(field.unique_value),
    cellValueType: cellValueType as IFieldVo['cellValueType'],
    isMultipleCellValue: type === FieldType.MultipleSelect || type === FieldType.Attachment,
    dbFieldType: dbFieldTypeFor(cellValueType) as IFieldVo['dbFieldType'],
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
    createdBy: 'Mochi Local',
    lastModifiedBy: 'Mochi Local',
  };
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
        this.mochiSqliteService.updateRecord(recordId, { fields: values }, tableId);
        updatedRecordIds.push(recordId);
        return;
      }

      const created = this.mochiSqliteService.createRecord({
        tableId,
        fields: values,
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
    @Body() body: ViewBody
  ): IViewVo | null {
    const updated = this.mochiSqliteService.updateView(
      viewId,
      {
        columnMeta: body.columnMeta ?? body,
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
    const type = body.type ?? FieldType.SingleLineText;
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
    const updated = this.mochiSqliteService.updateField(fieldId, {
      ...body,
      cellValueType: body.cellValueType ?? defaultCellValueTypeFor(body.type),
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
    @Query('search') search?: unknown,
    @Query('filter') filter?: string,
    @Query('orderBy') orderBy?: string
  ): { rowCount: number } {
    const records = this.mochiSqliteService.listRecords(tableId, {
      search: normalizeSearchQuery(search),
      limit: 100000,
      filters: normalizeFilterQuery(filter),
      sorts: normalizeSortQuery(orderBy),
    }) as LocalRecord[];
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
    @Query('search') search?: unknown,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('filter') filter?: string,
    @Query('orderBy') orderBy?: string
  ): { records: IRecord[] } {
    const records = this.mochiSqliteService.listRecords(tableId, {
      search: normalizeSearchQuery(search),
      limit: parseNumberQuery(take, 100),
      offset: parseNumberQuery(skip, 0),
      filters: normalizeFilterQuery(filter),
      sorts: normalizeSortQuery(orderBy),
    }) as LocalRecord[];
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
    @Body() body: CreateRecordsBody
  ): { records: IRecord[] } {
    const records = body.records?.length ? body.records : [{ fields: {} }];
    const created = records.map((record) =>
      this.mochiSqliteService.createRecord({
        tableId,
        fields: record.fields ?? {},
        order: body.order,
      })
    ) as LocalRecord[];
    return { records: created.map(toTeableRecord).filter(Boolean) as IRecord[] };
  }

  @Post(':tableId/record/:recordId/duplicate')
  duplicateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() order?: unknown
  ): IRecord | null {
    const source = this.mochiSqliteService.getRecord(recordId) as LocalRecord | null;
    if (!source) return null;
    const created = this.mochiSqliteService.createRecord({
      tableId,
      fields: { ...(source.fields ?? {}) },
      order,
    }) as LocalRecord;
    return toTeableRecord(created);
  }

  @Patch(':tableId/record/:recordId')
  updateRecord(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() body: UpdateRecordBody
  ): IRecord | null {
    const fields = body.record?.fields ?? body.fields ?? {};
    const updated = this.mochiSqliteService.updateRecord(
      recordId,
      {
        fields,
        order: body.order,
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
    for (const recordId of selection.recordIds) {
      const fields = selection.fieldIds.reduce<Record<string, unknown>>((acc, fieldId) => {
        acc[fieldId] = null;
        return acc;
      }, {});
      this.mochiSqliteService.updateRecord(recordId, { fields }, tableId);
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
