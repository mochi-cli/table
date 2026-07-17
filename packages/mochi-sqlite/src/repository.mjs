import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ids } from './ids.mjs';
import { jsonValue, SqliteCli, sqlValue } from './sqlite-cli.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(dirname, '../schema.sql');

const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const nowExpr = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const normalizeText = (value) => String(value ?? '').toLocaleLowerCase();

const compareValues = (left, right) => {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
};

const convertValue = (value, type) => {
  if (value === null || value === undefined || value === '') return null;
  switch (type) {
    case 'number': {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : null;
    }
    case 'checkbox':
      return Boolean(value);
    case 'date':
    case 'dateTime': {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'singleSelect':
      return typeof value === 'object' ? (value.title ?? value.name ?? String(value.id ?? '')) : String(value);
    case 'multipleSelect':
      if (Array.isArray(value)) return value;
      return [String(value)];
    case 'singleLineText':
    case 'longText':
    default:
      return String(value);
  }
};

export class MochiSqliteRepository {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new SqliteCli(dbPath);
  }

  init() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db.run(`.read ${JSON.stringify(schemaPath)}`);
    this.db.run(
      `INSERT OR IGNORE INTO mochi_space (id, name) VALUES ('spc_local', 'Mochi Local');`
    );
  }

  listSpaces() {
    return this.db.all(`SELECT * FROM mochi_space WHERE deleted_time IS NULL ORDER BY name;`);
  }

  createSpace(input) {
    const id = input.id ?? ids.space();
    this.db.run(`
      INSERT INTO mochi_space (id, name, avatar)
      VALUES (${sqlValue(id)}, ${sqlValue(input.name)}, ${sqlValue(input.avatar)});
    `);
    return this.getSpace(id);
  }

  getSpace(id) {
    return this.db.get(`SELECT * FROM mochi_space WHERE id = ${sqlValue(id)};`);
  }

  listBases(spaceId = 'spc_local') {
    return this.db.all(`
      SELECT * FROM mochi_base
      WHERE space_id = ${sqlValue(spaceId)} AND deleted_time IS NULL
      ORDER BY sort_order, created_time;
    `);
  }

  createBase(input) {
    const id = input.id ?? ids.base();
    const spaceId = input.spaceId ?? 'spc_local';
    this.db.run(`
      INSERT INTO mochi_base (id, space_id, name, icon, sort_order)
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(spaceId)},
        ${sqlValue(input.name)},
        ${sqlValue(input.icon)},
        ${sqlValue(input.order ?? 0)}
      );
    `);
    return this.getBase(id);
  }

  getBase(id) {
    return this.db.get(`SELECT * FROM mochi_base WHERE id = ${sqlValue(id)};`);
  }

  listTables(baseId) {
    return this.db.all(`
      SELECT * FROM mochi_table
      WHERE base_id = ${sqlValue(baseId)} AND deleted_time IS NULL
      ORDER BY sort_order, created_time;
    `);
  }

  createTable(input) {
    const id = input.id ?? ids.table();
    const primaryFieldId = input.primaryFieldId ?? ids.field();
    const viewId = input.viewId ?? ids.view();
    const statements = [
      `INSERT INTO mochi_table (id, base_id, name, description, icon, sort_order)
       VALUES (
         ${sqlValue(id)},
         ${sqlValue(input.baseId)},
         ${sqlValue(input.name)},
         ${sqlValue(input.description)},
         ${sqlValue(input.icon)},
         ${sqlValue(input.order ?? 0)}
       );`,
      `INSERT INTO mochi_field (
         id, table_id, name, type, cell_value_type, is_primary, sort_order
       )
       VALUES (
         ${sqlValue(primaryFieldId)},
         ${sqlValue(id)},
         ${sqlValue(input.primaryFieldName ?? 'Name')},
         'singleLineText',
         'string',
         1,
         0
       );`,
      `INSERT INTO mochi_view (id, table_id, name, type, sort_order)
       VALUES (${sqlValue(viewId)}, ${sqlValue(id)}, 'Grid view', 'grid', 0);`,
    ];
    this.db.transaction(statements);
    return this.getTable(id);
  }

  getTable(id) {
    return this.db.get(`SELECT * FROM mochi_table WHERE id = ${sqlValue(id)};`);
  }

  listFields(tableId) {
    return this.db
      .all(`
        SELECT * FROM mochi_field
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY sort_order, created_time;
      `)
      .map((field) => ({
        ...field,
        options: parseJson(field.options_json),
        meta: parseJson(field.meta_json),
        aiConfig: parseJson(field.ai_config_json),
      }));
  }

  updateField(id, patch) {
    const current = this.getField(id);
    if (!current) return null;
    const nextType = patch.type ?? current.type;
    const nextCellValueType = patch.cellValueType ?? current.cell_value_type;
    const statements = [
      `UPDATE mochi_field
       SET name = ${sqlValue(patch.name ?? current.name)},
           description = ${sqlValue(patch.description ?? current.description)},
           type = ${sqlValue(nextType)},
           cell_value_type = ${sqlValue(nextCellValueType)},
           options_json = ${patch.options === undefined ? sqlValue(current.options_json) : jsonValue(patch.options)},
           meta_json = ${patch.meta === undefined ? sqlValue(current.meta_json) : jsonValue(patch.meta)},
           ai_config_json = ${patch.aiConfig === undefined ? sqlValue(current.ai_config_json) : jsonValue(patch.aiConfig)},
           not_null = ${sqlValue(patch.notNull ?? Boolean(current.not_null))},
           unique_value = ${sqlValue(patch.unique ?? Boolean(current.unique_value))},
           version = version + 1,
           last_modified_time = ${nowExpr}
       WHERE id = ${sqlValue(id)};`,
    ];

    if (patch.type && patch.type !== current.type) {
      const records = this.listRecords(current.table_id, { limit: 100000 });
      for (const record of records) {
        if (!(id in record.fields)) continue;
        const fields = {
          ...record.fields,
          [id]: convertValue(record.fields[id], nextType),
        };
        statements.push(
          `UPDATE mochi_record
           SET fields_json = ${jsonValue(fields)},
               version = version + 1,
               last_modified_time = ${nowExpr}
           WHERE id = ${sqlValue(record.id)};`
        );
      }
    }

    this.db.transaction(statements);
    return this.getField(id);
  }

  createField(input) {
    const id = input.id ?? ids.field();
    const maxOrder = this.db.get(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM mochi_field
      WHERE table_id = ${sqlValue(input.tableId)} AND deleted_time IS NULL;
    `);
    this.db.run(`
      INSERT INTO mochi_field (
        id, table_id, name, description, type, cell_value_type,
        options_json, meta_json, ai_config_json, is_primary, is_computed,
        is_lookup, not_null, unique_value, sort_order
      )
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.tableId)},
        ${sqlValue(input.name)},
        ${sqlValue(input.description)},
        ${sqlValue(input.type)},
        ${sqlValue(input.cellValueType ?? 'string')},
        ${input.options === undefined ? 'NULL' : jsonValue(input.options)},
        ${input.meta === undefined ? 'NULL' : jsonValue(input.meta)},
        ${input.aiConfig === undefined ? 'NULL' : jsonValue(input.aiConfig)},
        ${sqlValue(Boolean(input.isPrimary))},
        ${sqlValue(Boolean(input.isComputed))},
        ${sqlValue(Boolean(input.isLookup))},
        ${sqlValue(Boolean(input.notNull))},
        ${sqlValue(Boolean(input.unique))},
        ${sqlValue(input.order ?? maxOrder?.next_order ?? 0)}
      );
    `);
    return this.getField(id);
  }

  getField(id) {
    const field = this.db.get(`SELECT * FROM mochi_field WHERE id = ${sqlValue(id)};`);
    if (!field) return null;
    return {
      ...field,
      options: parseJson(field.options_json),
      meta: parseJson(field.meta_json),
      aiConfig: parseJson(field.ai_config_json),
    };
  }

  listViews(tableId) {
    return this.db
      .all(`
        SELECT * FROM mochi_view
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY sort_order, created_time;
      `)
      .map((view) => ({
        ...view,
        options: parseJson(view.options_json),
        columnMeta: parseJson(view.column_meta_json),
        filter: parseJson(view.filter_json),
        sort: parseJson(view.sort_json),
        group: parseJson(view.group_json),
      }));
  }

  createView(input) {
    const id = input.id ?? ids.view();
    this.db.run(`
      INSERT INTO mochi_view (
        id, table_id, name, type, sort_order, options_json,
        column_meta_json, filter_json, sort_json, group_json
      )
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.tableId)},
        ${sqlValue(input.name)},
        ${sqlValue(input.type ?? 'grid')},
        ${sqlValue(input.order ?? 0)},
        ${input.options === undefined ? 'NULL' : jsonValue(input.options)},
        ${input.columnMeta === undefined ? 'NULL' : jsonValue(input.columnMeta)},
        ${input.filter === undefined ? 'NULL' : jsonValue(input.filter)},
        ${input.sort === undefined ? 'NULL' : jsonValue(input.sort)},
        ${input.group === undefined ? 'NULL' : jsonValue(input.group)}
      );
    `);
    return this.getView(id);
  }

  getView(id) {
    const view = this.db.get(`SELECT * FROM mochi_view WHERE id = ${sqlValue(id)};`);
    if (!view) return null;
    return {
      ...view,
      options: parseJson(view.options_json),
      columnMeta: parseJson(view.column_meta_json),
      filter: parseJson(view.filter_json),
      sort: parseJson(view.sort_json),
      group: parseJson(view.group_json),
    };
  }

  listRecords(tableId, options = {}) {
    const limit = Math.min(options.limit ?? 100, 100000);
    const offset = options.offset ?? 0;
    let records = this.db
      .all(`
        SELECT * FROM mochi_record
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY auto_number, created_time
      `)
      .map((record) => ({
        ...record,
        fields: parseJson(record.fields_json, {}),
        order: parseJson(record.order_json),
      }));

    if (options.search) {
      const needle = normalizeText(options.search);
      records = records.filter((record) =>
        Object.values(record.fields).some((value) => normalizeText(value).includes(needle))
      );
    }

    for (const filter of options.filters ?? []) {
      records = records.filter((record) => {
        const value = record.fields[filter.fieldId];
        switch (filter.operator) {
          case 'is':
            return value === filter.value;
          case 'isNot':
            return value !== filter.value;
          case 'contains':
            return normalizeText(value).includes(normalizeText(filter.value));
          case 'isEmpty':
            return value === null || value === undefined || value === '';
          case 'isNotEmpty':
            return value !== null && value !== undefined && value !== '';
          case 'gt':
            return Number(value) > Number(filter.value);
          case 'lt':
            return Number(value) < Number(filter.value);
          default:
            return true;
        }
      });
    }

    for (const sorter of [...(options.sorts ?? [])].reverse()) {
      const direction = sorter.direction === 'desc' ? -1 : 1;
      records = records.sort(
        (left, right) =>
          compareValues(left.fields[sorter.fieldId], right.fields[sorter.fieldId]) * direction
      );
    }

    return records.slice(offset, offset + limit);
  }

  createRecord(input) {
    const id = input.id ?? ids.record();
    const auto = this.db.get(`
      SELECT COALESCE(MAX(auto_number), 0) + 1 AS next_auto
      FROM mochi_record
      WHERE table_id = ${sqlValue(input.tableId)};
    `);
    const batchId = input.batchId ?? ids.opBatch();
    const statements = [
      `INSERT INTO mochi_record (id, table_id, auto_number, fields_json, order_json)
       VALUES (
         ${sqlValue(id)},
         ${sqlValue(input.tableId)},
         ${sqlValue(input.autoNumber ?? auto?.next_auto ?? 1)},
         ${jsonValue(input.fields ?? {})},
         ${input.order === undefined ? 'NULL' : jsonValue(input.order)}
       );`,
      `INSERT INTO mochi_op_batch (id, label, source)
       VALUES (${sqlValue(batchId)}, ${sqlValue(input.label ?? 'Create record')}, ${sqlValue(input.source ?? 'user')})
       ON CONFLICT(id) DO NOTHING;`,
      `INSERT INTO mochi_op (id, batch_id, table_id, record_id, op_type, before_json, after_json)
       VALUES (
         ${sqlValue(ids.op())},
         ${sqlValue(batchId)},
         ${sqlValue(input.tableId)},
         ${sqlValue(id)},
         'record.create',
         NULL,
         ${jsonValue({ fields: input.fields ?? {}, order: input.order ?? null })}
       );`,
    ];
    this.db.transaction(statements);
    return this.getRecord(id);
  }

  getRecord(id) {
    const record = this.db.get(`SELECT * FROM mochi_record WHERE id = ${sqlValue(id)};`);
    if (!record) return null;
    return {
      ...record,
      fields: parseJson(record.fields_json, {}),
      order: parseJson(record.order_json),
    };
  }

  updateRecord(id, patch) {
    const current = this.getRecord(id);
    if (!current) return null;
    const nextFields = { ...current.fields, ...(patch.fields ?? {}) };
    const nextOrder = patch.order === undefined ? current.order : patch.order;
    const batchId = patch.batchId ?? ids.opBatch();
    const statements = [
      `UPDATE mochi_record
       SET fields_json = ${jsonValue(nextFields)},
           order_json = ${nextOrder === undefined || nextOrder === null ? 'NULL' : jsonValue(nextOrder)},
           version = version + 1,
           last_modified_time = ${nowExpr}
       WHERE id = ${sqlValue(id)};`,
      `INSERT INTO mochi_op_batch (id, label, source)
       VALUES (${sqlValue(batchId)}, ${sqlValue(patch.label ?? 'Update record')}, ${sqlValue(patch.source ?? 'user')})
       ON CONFLICT(id) DO NOTHING;`,
      `INSERT INTO mochi_op (id, batch_id, table_id, record_id, op_type, before_json, after_json)
       VALUES (
         ${sqlValue(ids.op())},
         ${sqlValue(batchId)},
         ${sqlValue(current.table_id)},
         ${sqlValue(id)},
         'record.update',
         ${jsonValue({ fields: current.fields, order: current.order ?? null })},
         ${jsonValue({ fields: nextFields, order: nextOrder ?? null })}
       );`,
    ];
    this.db.transaction(statements);
    return this.getRecord(id);
  }

  deleteRecord(id, options = {}) {
    const current = this.getRecord(id);
    if (!current) return null;
    const batchId = options.batchId ?? ids.opBatch();
    const statements = [
      `UPDATE mochi_record
       SET deleted_time = ${nowExpr}, version = version + 1
       WHERE id = ${sqlValue(id)};`,
      `INSERT INTO mochi_op_batch (id, label, source)
       VALUES (${sqlValue(batchId)}, ${sqlValue(options.label ?? 'Delete record')}, ${sqlValue(options.source ?? 'user')})
       ON CONFLICT(id) DO NOTHING;`,
      `INSERT INTO mochi_op (id, batch_id, table_id, record_id, op_type, before_json, after_json)
       VALUES (
         ${sqlValue(ids.op())},
         ${sqlValue(batchId)},
         ${sqlValue(current.table_id)},
         ${sqlValue(id)},
         'record.delete',
         ${jsonValue({ fields: current.fields, order: current.order ?? null })},
         NULL
       );`,
    ];
    this.db.transaction(statements);
    return current;
  }

  getLastUndoableBatch() {
    return this.db.get(`
      SELECT * FROM mochi_op_batch
      WHERE undone_time IS NULL
      ORDER BY created_time DESC
      LIMIT 1;
    `);
  }

  getLastRedoableBatch() {
    return this.db.get(`
      SELECT * FROM mochi_op_batch
      WHERE undone_time IS NOT NULL
      ORDER BY undone_time DESC
      LIMIT 1;
    `);
  }

  undoLastBatch() {
    const batch = this.getLastUndoableBatch();
    if (!batch) return null;
    const ops = this.db.all(`
      SELECT * FROM mochi_op
      WHERE batch_id = ${sqlValue(batch.id)}
      ORDER BY created_time DESC;
    `);
    const statements = [];
    for (const op of ops) {
      const before = parseJson(op.before_json);
      if (op.op_type === 'record.create') {
        statements.push(
          `UPDATE mochi_record SET deleted_time = ${nowExpr}, version = version + 1 WHERE id = ${sqlValue(op.record_id)};`
        );
      }
      if (op.op_type === 'record.update' || op.op_type === 'record.delete') {
        statements.push(
          `UPDATE mochi_record
           SET fields_json = ${jsonValue(before?.fields ?? {})},
               order_json = ${before?.order === undefined || before?.order === null ? 'NULL' : jsonValue(before.order)},
               deleted_time = NULL,
               version = version + 1,
               last_modified_time = ${nowExpr}
           WHERE id = ${sqlValue(op.record_id)};`
        );
      }
    }
    statements.push(
      `UPDATE mochi_op_batch SET undone_time = ${nowExpr}, redone_time = NULL WHERE id = ${sqlValue(batch.id)};`
    );
    this.db.transaction(statements);
    return batch;
  }

  redoLastBatch() {
    const batch = this.getLastRedoableBatch();
    if (!batch) return null;
    const ops = this.db.all(`
      SELECT * FROM mochi_op
      WHERE batch_id = ${sqlValue(batch.id)}
      ORDER BY created_time ASC;
    `);
    const statements = [];
    for (const op of ops) {
      const after = parseJson(op.after_json);
      if (op.op_type === 'record.create' || op.op_type === 'record.update') {
        statements.push(
          `UPDATE mochi_record
           SET fields_json = ${jsonValue(after?.fields ?? {})},
               order_json = ${after?.order === undefined || after?.order === null ? 'NULL' : jsonValue(after.order)},
               deleted_time = NULL,
               version = version + 1,
               last_modified_time = ${nowExpr}
           WHERE id = ${sqlValue(op.record_id)};`
        );
      }
      if (op.op_type === 'record.delete') {
        statements.push(
          `UPDATE mochi_record SET deleted_time = ${nowExpr}, version = version + 1 WHERE id = ${sqlValue(op.record_id)};`
        );
      }
    }
    statements.push(
      `UPDATE mochi_op_batch SET redone_time = ${nowExpr}, undone_time = NULL WHERE id = ${sqlValue(batch.id)};`
    );
    this.db.transaction(statements);
    return batch;
  }
}
