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

const remapJsonIds = (value, idMap) => {
  if (typeof value === 'string') return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapJsonIds(item, idMap));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [idMap.get(key) ?? key, remapJsonIds(item, idMap)])
  );
};

const removeFieldColumnMeta = (columnMeta, fieldId) => {
  if (Array.isArray(columnMeta)) {
    return columnMeta.filter((item) => item?.fieldId !== fieldId);
  }
  if (!columnMeta || typeof columnMeta !== 'object') return columnMeta;
  const nextColumnMeta = { ...columnMeta };
  delete nextColumnMeta[fieldId];
  return nextColumnMeta;
};

const remapRecordFields = (fields, fieldIdMap, recordIdMap) =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([fieldId, value]) => [
      fieldIdMap.get(fieldId) ?? fieldId,
      remapJsonIds(value, recordIdMap),
    ])
  );

const flattenSearchText = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(flattenSearchText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flattenSearchText).join(' ');
  return String(value);
};

const inferFieldType = (value) => {
  if (typeof value === 'number') return { type: 'number', cellValueType: 'number' };
  if (typeof value === 'boolean') return { type: 'checkbox', cellValueType: 'boolean' };
  if (typeof value === 'string') {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(date.getTime())) {
      return { type: 'date', cellValueType: 'dateTime' };
    }
  }
  return { type: 'singleLineText', cellValueType: 'string' };
};

const aggregateValues = (values, aggregate = 'values') => {
  const compact = values.filter((value) => value !== null && value !== undefined && value !== '');
  switch (aggregate) {
    case 'count':
      return compact.length;
    case 'sum':
      return compact.reduce((total, value) => total + Number(value || 0), 0);
    case 'avg':
      return compact.length
        ? compact.reduce((total, value) => total + Number(value || 0), 0) / compact.length
        : null;
    case 'min':
      return compact.length ? Math.min(...compact.map(Number)) : null;
    case 'max':
      return compact.length ? Math.max(...compact.map(Number)) : null;
    case 'first':
      return compact[0] ?? null;
    case 'join':
      return compact.map(String).join(', ');
    case 'values':
    default:
      return compact;
  }
};

const formulaTokenize = (expression) => {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const twoCharOperator = expression.slice(index, index + 2);
    if (['>=', '<=', '!=', '=='].includes(twoCharOperator)) {
      tokens.push({ type: twoCharOperator, value: twoCharOperator });
      index += 2;
      continue;
    }
    if ('+-*/(),><='.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < expression.length) {
        const next = expression[index];
        if (next === '\\') {
          value += expression[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (next === quote) break;
        value += next;
        index += 1;
      }
      if (expression[index] !== quote) throw new Error('Unterminated formula string');
      tokens.push({ type: 'string', value });
      index += 1;
      continue;
    }
    if (char === '{') {
      const end = expression.indexOf('}', index + 1);
      if (end === -1) throw new Error('Unterminated formula reference');
      tokens.push({ type: 'reference', value: expression.slice(index + 1, end).trim() });
      index = end + 1;
      continue;
    }
    if (/\d|\./.test(char)) {
      let value = '';
      while (index < expression.length && /[\d.]/.test(expression[index])) {
        value += expression[index];
        index += 1;
      }
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) throw new Error(`Invalid formula number: ${value}`);
      tokens.push({ type: 'number', value: numberValue });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = '';
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) {
        value += expression[index];
        index += 1;
      }
      tokens.push({ type: 'identifier', value });
      continue;
    }
    throw new Error(`Unexpected formula token: ${char}`);
  }
  return tokens;
};

const formulaToNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const formulaString = (value) => (value === null || value === undefined ? '' : String(value));
const formulaNumbers = (args) => args.map(formulaToNumber).filter((value) => value !== null);
const formulaBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLocaleLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

const formulaDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const padDatePart = (value) => String(value).padStart(2, '0');

const formatFormulaDate = (date, pattern = 'YYYY-MM-DD') => {
  const replacements = {
    YYYY: String(date.getUTCFullYear()),
    MM: padDatePart(date.getUTCMonth() + 1),
    DD: padDatePart(date.getUTCDate()),
    HH: padDatePart(date.getUTCHours()),
    mm: padDatePart(date.getUTCMinutes()),
    ss: padDatePart(date.getUTCSeconds()),
  };
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replaceAll(token, value),
    pattern
  );
};

const evaluateFormulaExpression = (expression, fields, fieldByName) => {
  const tokens = formulaTokenize(String(expression ?? ''));
  let index = 0;

  const peek = () => tokens[index];
  const take = (type) => {
    const token = peek();
    if (!token || token.type !== type) return null;
    index += 1;
    return token;
  };
  const expect = (type) => {
    const token = take(type);
    if (!token) throw new Error(`Expected formula token: ${type}`);
    return token;
  };
  const resolveReference = (reference) => {
    if (Object.prototype.hasOwnProperty.call(fields, reference)) return fields[reference];
    const field = fieldByName.get(reference.toLocaleLowerCase());
    return field ? fields[field.id] : null;
  };
  const callFunction = (name, args) => {
    switch (name.toLocaleUpperCase()) {
      case 'CONCATENATE':
        return args.map(formulaString).join('');
      case 'TRIM':
        return formulaString(args[0]).trim();
      case 'LEFT':
        return formulaString(args[0]).slice(0, Math.max(0, formulaToNumber(args[1]) ?? 0));
      case 'RIGHT': {
        const count = Math.max(0, formulaToNumber(args[1]) ?? 0);
        return count === 0 ? '' : formulaString(args[0]).slice(-count);
      }
      case 'REPT':
        return formulaString(args[0]).repeat(Math.max(0, formulaToNumber(args[1]) ?? 0));
      case 'LOWER':
        return formulaString(args[0]).toLocaleLowerCase();
      case 'UPPER':
        return formulaString(args[0]).toLocaleUpperCase();
      case 'LEN':
        return formulaString(args[0]).length;
      case 'ABS': {
        const value = formulaToNumber(args[0]);
        return value === null ? null : Math.abs(value);
      }
      case 'ROUND': {
        const value = formulaToNumber(args[0]);
        if (value === null) return null;
        const precision = Math.max(0, Math.min(10, formulaToNumber(args[1]) ?? 0));
        return Number(value.toFixed(precision));
      }
      case 'SUM':
        return formulaNumbers(args).reduce((total, value) => total + value, 0);
      case 'AVERAGE': {
        const values = formulaNumbers(args);
        return values.length
          ? values.reduce((total, value) => total + value, 0) / values.length
          : null;
      }
      case 'MIN': {
        const values = formulaNumbers(args);
        return values.length ? Math.min(...values) : null;
      }
      case 'MAX': {
        const values = formulaNumbers(args);
        return values.length ? Math.max(...values) : null;
      }
      case 'IF':
        return args[0] ? args[1] : args[2];
      case 'AND':
        return args.every(formulaBool);
      case 'OR':
        return args.some(formulaBool);
      case 'NOT':
        return !formulaBool(args[0]);
      case 'ISBLANK':
        return args[0] === null || args[0] === undefined || args[0] === '';
      case 'BLANK':
        return null;
      case 'TODAY': {
        const date = new Date();
        return formatFormulaDate(
          new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        );
      }
      case 'NOW':
        return new Date().toISOString();
      case 'DATETIME_FORMAT': {
        const date = formulaDate(args[0]);
        return date ? formatFormulaDate(date, formulaString(args[1]) || 'YYYY-MM-DD') : null;
      }
      case 'DATEADD': {
        const date = formulaDate(args[0]);
        const amount = formulaToNumber(args[1]);
        if (!date || amount === null) return null;
        const unit = formulaString(args[2]).toLocaleLowerCase();
        const nextDate = new Date(date.getTime());
        if (unit.startsWith('day')) nextDate.setUTCDate(nextDate.getUTCDate() + amount);
        else if (unit.startsWith('month')) nextDate.setUTCMonth(nextDate.getUTCMonth() + amount);
        else if (unit.startsWith('year'))
          nextDate.setUTCFullYear(nextDate.getUTCFullYear() + amount);
        else if (unit.startsWith('hour')) nextDate.setUTCHours(nextDate.getUTCHours() + amount);
        else if (unit.startsWith('minute'))
          nextDate.setUTCMinutes(nextDate.getUTCMinutes() + amount);
        else return null;
        return nextDate.toISOString();
      }
      default:
        throw new Error(`Unsupported formula function: ${name}`);
    }
  };

  const parseExpression = () => parseComparison();
  const parsePrimary = () => {
    const token = peek();
    if (!token) throw new Error('Unexpected end of formula');
    if (take('number')) return token.value;
    if (take('string')) return token.value;
    if (take('reference')) return resolveReference(token.value);
    if (take('(')) {
      const value = parseExpression();
      expect(')');
      return value;
    }
    if (token.type === 'identifier') {
      index += 1;
      const constantName = token.value.toLocaleUpperCase();
      if (!peek() || peek()?.type !== '(') {
        if (constantName === 'TRUE') return true;
        if (constantName === 'FALSE') return false;
        throw new Error(`Expected formula function call: ${token.value}`);
      }
      expect('(');
      const args = [];
      if (!take(')')) {
        do {
          args.push(parseExpression());
        } while (take(','));
        expect(')');
      }
      return callFunction(token.value, args);
    }
    throw new Error(`Unexpected formula token: ${token.type}`);
  };
  const parseUnary = () => {
    if (take('-')) {
      const value = formulaToNumber(parseUnary());
      return value === null ? null : -value;
    }
    if (take('+')) return parseUnary();
    return parsePrimary();
  };
  const parseMultiplicative = () => {
    let left = parseUnary();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = tokens[index].type;
      index += 1;
      const right = parseUnary();
      const leftNumber = formulaToNumber(left);
      const rightNumber = formulaToNumber(right);
      if (leftNumber === null || rightNumber === null) {
        left = null;
      } else if (operator === '*') {
        left = leftNumber * rightNumber;
      } else {
        left = rightNumber === 0 ? null : leftNumber / rightNumber;
      }
    }
    return left;
  };
  const parseAdditive = () => {
    let left = parseMultiplicative();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = tokens[index].type;
      index += 1;
      const right = parseMultiplicative();
      if (operator === '+') {
        const leftNumber = formulaToNumber(left);
        const rightNumber = formulaToNumber(right);
        left =
          leftNumber !== null && rightNumber !== null
            ? leftNumber + rightNumber
            : `${formulaString(left)}${formulaString(right)}`;
      } else {
        const leftNumber = formulaToNumber(left);
        const rightNumber = formulaToNumber(right);
        left = leftNumber === null || rightNumber === null ? null : leftNumber - rightNumber;
      }
    }
    return left;
  };
  const parseComparison = () => {
    let left = parseAdditive();
    while (['>', '<', '>=', '<=', '=', '==', '!='].includes(peek()?.type)) {
      const operator = tokens[index].type;
      index += 1;
      const right = parseAdditive();
      const leftNumber = formulaToNumber(left);
      const rightNumber = formulaToNumber(right);
      const comparison =
        leftNumber !== null && rightNumber !== null
          ? leftNumber - rightNumber
          : formulaString(left).localeCompare(formulaString(right), undefined, {
              numeric: true,
            });
      switch (operator) {
        case '>':
          left = comparison > 0;
          break;
        case '<':
          left = comparison < 0;
          break;
        case '>=':
          left = comparison >= 0;
          break;
        case '<=':
          left = comparison <= 0;
          break;
        case '=':
        case '==':
          left = comparison === 0;
          break;
        case '!=':
          left = comparison !== 0;
          break;
        default:
          left = false;
      }
    }
    return left;
  };

  if (!tokens.length) return null;
  const value = parseExpression();
  if (index < tokens.length) throw new Error(`Unexpected formula token: ${tokens[index].type}`);
  return value;
};

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
      if (typeof value === 'string') {
        const normalized = value.trim().toLocaleLowerCase();
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      }
      return Boolean(value);
    case 'date':
    case 'dateTime': {
      if (typeof value === 'number' || typeof value === 'boolean') return null;
      if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value.trim()))
        return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'singleSelect':
      return typeof value === 'object'
        ? value.title ?? value.name ?? String(value.id ?? '')
        : String(value);
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
      `INSERT OR IGNORE INTO mochi_space (id, name) VALUES ('spc_local', 'Mochi Local');
       INSERT OR IGNORE INTO mochi_migration (version, name) VALUES ('000_schema_sql', 'schema.sql baseline');`
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

  updateTable(id, patch = {}) {
    const updates = [];
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      updates.push(`name = ${sqlValue(patch.name)}`);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
      updates.push(`description = ${sqlValue(patch.description)}`);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'icon')) {
      updates.push(`icon = ${sqlValue(patch.icon)}`);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'order')) {
      updates.push(`sort_order = ${sqlValue(patch.order)}`);
    }
    if (!updates.length) return this.getTable(id);
    this.db.run(`
      UPDATE mochi_table
      SET ${updates.join(', ')}, last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(id)} AND deleted_time IS NULL;
    `);
    return this.getTable(id);
  }

  deleteTable(id) {
    const current = this.getTable(id);
    if (!current || current.deleted_time) return null;
    this.db.run(`
      UPDATE mochi_table
      SET deleted_time = ${nowExpr},
          version = version + 1,
          last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(id)} AND deleted_time IS NULL;
    `);
    return current;
  }

  permanentDeleteTable(id) {
    const current = this.getTable(id);
    if (!current) return null;
    this.db.transaction([
      `DELETE FROM mochi_record_fts WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_attachment_ref WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_comment WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_record_history WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_op WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_computed_job WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_record WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_view WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_field WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_trash WHERE resource_type = 'table' AND resource_id = ${sqlValue(id)};`,
      `UPDATE mochi_import_source SET table_id = NULL WHERE table_id = ${sqlValue(id)};`,
      `DELETE FROM mochi_table WHERE id = ${sqlValue(id)};`,
    ]);
    return current;
  }

  duplicateTable(id, input = {}) {
    const source = this.getTable(id);
    if (!source || source.deleted_time) return null;
    const sourceFields = this.listFields(id);
    const sourceViews = this.listViews(id);
    const includeRecords = input.includeRecords !== false;
    const sourceRecords = includeRecords ? this.listRecords(id, { limit: 100000 }) : [];
    const fieldIdMap = new Map(sourceFields.map((field) => [field.id, ids.field()]));
    const viewIdMap = new Map(sourceViews.map((view) => [view.id, ids.view()]));
    const recordIdMap = new Map(sourceRecords.map((record) => [record.id, ids.record()]));
    const primaryField = sourceFields.find((field) => field.is_primary) ?? sourceFields[0];

    const table = this.createTable({
      id: input.id,
      baseId: input.baseId ?? source.base_id,
      name: input.name ?? `${source.name} copy`,
      description: input.description ?? source.description,
      icon: input.icon === undefined ? source.icon : input.icon,
      order: input.order,
      primaryFieldId: primaryField ? fieldIdMap.get(primaryField.id) : undefined,
      primaryFieldName: primaryField?.name ?? 'Name',
      viewId: sourceViews[0] ? viewIdMap.get(sourceViews[0].id) : undefined,
    });

    if (primaryField) {
      this.updateField(fieldIdMap.get(primaryField.id), {
        name: primaryField.name,
        description: primaryField.description,
        type: primaryField.type,
        cellValueType: primaryField.cell_value_type,
        options: remapJsonIds(primaryField.options, fieldIdMap),
        meta: remapJsonIds(primaryField.meta, fieldIdMap),
        aiConfig: remapJsonIds(primaryField.aiConfig, fieldIdMap),
        notNull: Boolean(primaryField.not_null),
        unique: Boolean(primaryField.unique_value),
      });
    }

    for (const field of sourceFields) {
      if (field.id === primaryField?.id) continue;
      this.createField({
        id: fieldIdMap.get(field.id),
        tableId: table.id,
        name: field.name,
        description: field.description,
        type: field.type,
        cellValueType: field.cell_value_type,
        options: remapJsonIds(field.options, fieldIdMap),
        meta: remapJsonIds(field.meta, fieldIdMap),
        aiConfig: remapJsonIds(field.aiConfig, fieldIdMap),
        isComputed: Boolean(field.is_computed),
        isLookup: Boolean(field.is_lookup),
        notNull: Boolean(field.not_null),
        unique: Boolean(field.unique_value),
        order: field.sort_order,
      });
    }

    for (const view of sourceViews) {
      const viewInput = {
        tableId: table.id,
        name: view.name,
        type: view.type,
        order: view.sort_order,
        options: remapJsonIds(view.options, fieldIdMap),
        columnMeta: remapJsonIds(view.columnMeta, fieldIdMap),
        filter: remapJsonIds(view.filter, fieldIdMap),
        sort: remapJsonIds(view.sort, fieldIdMap),
        group: remapJsonIds(view.group, fieldIdMap),
      };
      if (view.id === sourceViews[0]?.id) {
        this.updateView(viewIdMap.get(view.id), viewInput);
      } else {
        this.createView({ id: viewIdMap.get(view.id), ...viewInput });
      }
    }

    const batchId = ids.opBatch();
    for (const record of sourceRecords) {
      this.createRecord({
        id: recordIdMap.get(record.id),
        tableId: table.id,
        autoNumber: record.auto_number,
        fields: remapRecordFields(record.fields, fieldIdMap, recordIdMap),
        order: remapJsonIds(record.order, recordIdMap),
        batchId,
        label: 'Duplicate table records',
        source: 'duplicate-table',
      });
    }

    return this.getTable(table.id);
  }

  listFields(tableId) {
    return this.db
      .all(
        `
        SELECT * FROM mochi_field
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY sort_order, created_time;
      `
      )
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
        statements.push(...this.recordSearchStatements(current.table_id, record.id, fields));
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
    const field = this.db.get(
      `SELECT * FROM mochi_field WHERE id = ${sqlValue(id)} AND deleted_time IS NULL;`
    );
    if (!field) return null;
    return {
      ...field,
      options: parseJson(field.options_json),
      meta: parseJson(field.meta_json),
      aiConfig: parseJson(field.ai_config_json),
    };
  }

  deleteField(id) {
    const current = this.getField(id);
    if (!current || current.is_primary) return null;
    const records = this.listRecords(current.table_id, { limit: 100000 });
    const statements = [
      `UPDATE mochi_field
       SET deleted_time = ${nowExpr},
           version = version + 1,
           last_modified_time = ${nowExpr}
       WHERE id = ${sqlValue(id)};`,
    ];

    for (const record of records) {
      if (!(id in record.fields)) continue;
      const nextFields = { ...record.fields };
      delete nextFields[id];
      statements.push(
        `UPDATE mochi_record
         SET fields_json = ${jsonValue(nextFields)},
             version = version + 1,
             last_modified_time = ${nowExpr}
         WHERE id = ${sqlValue(record.id)};`
      );
      statements.push(...this.recordSearchStatements(current.table_id, record.id, nextFields));
    }

    for (const view of this.listViews(current.table_id)) {
      const nextColumnMeta = removeFieldColumnMeta(view.columnMeta, id);
      if (JSON.stringify(nextColumnMeta) === JSON.stringify(view.columnMeta)) continue;
      statements.push(
        `UPDATE mochi_view
         SET column_meta_json = ${jsonValue(nextColumnMeta)},
             last_modified_time = ${nowExpr}
         WHERE id = ${sqlValue(view.id)};`
      );
    }

    this.db.transaction(statements);
    return current;
  }

  listViews(tableId) {
    return this.db
      .all(
        `
        SELECT * FROM mochi_view
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY sort_order, created_time;
      `
      )
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

  updateView(id, patch) {
    const current = this.getView(id);
    if (!current) return null;
    this.db.run(`
      UPDATE mochi_view
      SET name = ${sqlValue(patch.name ?? current.name)},
          type = ${sqlValue(patch.type ?? current.type)},
          options_json = ${patch.options === undefined ? sqlValue(current.options_json) : jsonValue(patch.options)},
          column_meta_json = ${patch.columnMeta === undefined ? sqlValue(current.column_meta_json) : jsonValue(patch.columnMeta)},
          filter_json = ${patch.filter === undefined ? sqlValue(current.filter_json) : jsonValue(patch.filter)},
          sort_json = ${patch.sort === undefined ? sqlValue(current.sort_json) : jsonValue(patch.sort)},
          group_json = ${patch.group === undefined ? sqlValue(current.group_json) : jsonValue(patch.group)},
          last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(id)};
    `);
    return this.getView(id);
  }

  deleteView(id) {
    const current = this.getView(id);
    if (!current) return null;
    this.db.run(`
      UPDATE mochi_view
      SET deleted_time = ${nowExpr},
          last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(id)};
    `);
    return current;
  }

  listRecords(tableId, options = {}) {
    const limit = Math.min(options.limit ?? 100, 100000);
    const offset = options.offset ?? 0;
    let records = this.db
      .all(
        `
        SELECT * FROM mochi_record
        WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
        ORDER BY auto_number, created_time
      `
      )
      .map((record) => ({
        ...record,
        fields: parseJson(record.fields_json, {}),
        order: parseJson(record.order_json),
      }));

    if (options.search) {
      const indexedIds = this.searchRecordIds(tableId, options.search);
      if (indexedIds.length > 0) {
        const indexedIdSet = new Set(indexedIds);
        records = records.filter((record) => indexedIdSet.has(record.id));
      } else {
        const needle = normalizeText(options.search);
        records = records.filter((record) =>
          Object.values(record.fields).some((value) => normalizeText(value).includes(needle))
        );
      }
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
            if (value === null || value === undefined || value === '') return false;
            return Number(value) > Number(filter.value);
          case 'lt':
            if (value === null || value === undefined || value === '') return false;
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
      ...this.recordSearchStatements(input.tableId, id, input.fields ?? {}),
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
      ...this.recordHistoryStatements(current.table_id, id, current.fields, nextFields),
      ...this.recordSearchStatements(current.table_id, id, nextFields),
    ];
    this.db.transaction(statements);
    return this.getRecord(id);
  }

  recordHistoryStatements(tableId, recordId, beforeFields, afterFields) {
    const fieldIds = new Set([
      ...Object.keys(beforeFields ?? {}),
      ...Object.keys(afterFields ?? {}),
    ]);
    return [...fieldIds].flatMap((fieldId) => {
      const before = beforeFields?.[fieldId] ?? null;
      const after = afterFields?.[fieldId] ?? null;
      if (JSON.stringify(before) === JSON.stringify(after)) return [];
      return [
        `INSERT INTO mochi_record_history (id, table_id, record_id, field_id, before_json, after_json)
         VALUES (
           ${sqlValue(ids.recordHistory())},
           ${sqlValue(tableId)},
           ${sqlValue(recordId)},
           ${sqlValue(fieldId)},
           ${jsonValue(before)},
           ${jsonValue(after)}
         );`,
      ];
    });
  }

  listRecordHistory(tableId, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit ?? 50), 100));
    if (Array.isArray(options.createdByIds) && !options.createdByIds.includes('usr_mochi_local')) {
      return { rows: [], nextCursor: null };
    }

    const filters = [`h.table_id = ${sqlValue(tableId)}`];
    filters.push('t.deleted_time IS NULL');
    filters.push('r.deleted_time IS NULL');
    filters.push('f.deleted_time IS NULL');
    if (options.recordId) filters.push(`h.record_id = ${sqlValue(options.recordId)}`);
    if (Array.isArray(options.fieldIds) && options.fieldIds.length) {
      filters.push(`h.field_id IN (${options.fieldIds.map(sqlValue).join(', ')})`);
    }
    if (options.startDate) filters.push(`h.created_time >= ${sqlValue(options.startDate)}`);
    if (options.endDate) filters.push(`h.created_time <= ${sqlValue(options.endDate)}`);

    if (options.cursor) {
      const cursor = this.db.get(
        `SELECT id, created_time FROM mochi_record_history WHERE id = ${sqlValue(options.cursor)};`
      );
      if (cursor) {
        filters.push(
          `(h.created_time < ${sqlValue(cursor.created_time)} OR (h.created_time = ${sqlValue(cursor.created_time)} AND h.id < ${sqlValue(cursor.id)}))`
        );
      }
    }

    const rows = this.db
      .all(
        `
        SELECT
          h.*,
          f.name AS field_name,
          f.type AS field_type,
          f.cell_value_type AS field_cell_value_type,
          f.options_json AS field_options_json,
          f.is_lookup AS field_is_lookup
        FROM mochi_record_history h
        JOIN mochi_table t ON t.id = h.table_id
        JOIN mochi_record r ON r.id = h.record_id
        JOIN mochi_field f ON f.id = h.field_id
        WHERE ${filters.join(' AND ')}
        ORDER BY h.created_time DESC, h.id DESC
        LIMIT ${limit + 1};
      `
      )
      .map((row) => ({
        ...row,
        before: parseJson(row.before_json),
        after: parseJson(row.after_json),
        field: {
          id: row.field_id,
          name: row.field_name,
          type: row.field_type,
          cell_value_type: row.field_cell_value_type,
          options: parseJson(row.field_options_json),
          is_lookup: row.field_is_lookup,
        },
      }));

    const page = rows.slice(0, limit);
    return {
      rows: page,
      nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null,
    };
  }

  resolveLookupRollup(tableId, options = {}) {
    const fields = this.listFields(tableId).filter(
      (field) => field.is_lookup || field.type === 'lookup' || field.type === 'rollup'
    );
    const records = options.recordId
      ? [this.getRecord(options.recordId)].filter(Boolean)
      : this.listRecords(tableId, { limit: 100000 });
    let updatedRecords = 0;
    const statements = [];

    for (const record of records) {
      const nextFields = { ...record.fields };
      let changed = false;
      for (const field of fields) {
        const config = {
          ...(field.options ?? {}),
          ...(field.meta ?? {}),
        };
        const linkFieldId = config.linkFieldId ?? config.sourceRecordFieldId;
        const valueFieldId = config.valueFieldId ?? config.sourceValueFieldId;
        if (!linkFieldId || !valueFieldId) continue;
        const linkedRecordIds = Array.isArray(record.fields[linkFieldId])
          ? record.fields[linkFieldId]
          : [record.fields[linkFieldId]].filter(Boolean);
        const values = linkedRecordIds
          .map((recordId) => this.getRecord(recordId))
          .filter(Boolean)
          .map((linkedRecord) => linkedRecord.fields?.[valueFieldId]);
        const nextValue =
          field.type === 'rollup'
            ? aggregateValues(values, config.aggregate)
            : values.length <= 1
              ? values[0] ?? null
              : values;
        if (JSON.stringify(nextFields[field.id] ?? null) !== JSON.stringify(nextValue ?? null)) {
          nextFields[field.id] = nextValue;
          changed = true;
        }
      }
      if (!changed) continue;
      updatedRecords += 1;
      statements.push(
        `UPDATE mochi_record
         SET fields_json = ${jsonValue(nextFields)},
             version = version + 1,
             last_modified_time = ${nowExpr}
         WHERE id = ${sqlValue(record.id)};`,
        ...this.recordSearchStatements(tableId, record.id, nextFields)
      );
    }

    if (statements.length > 0) this.db.transaction(statements);
    return { tableId, fields: fields.length, records: records.length, updatedRecords };
  }

  resolveFormulas(tableId, options = {}) {
    const tableFields = this.listFields(tableId);
    const fieldByName = new Map(
      tableFields.map((field) => [field.name.toLocaleLowerCase(), field])
    );
    const formulaFields = tableFields.filter(
      (field) => field.type === 'formula' || (field.is_computed && field.options?.expression)
    );
    const records = options.recordId
      ? [this.getRecord(options.recordId)].filter((record) => record?.table_id === tableId)
      : this.listRecords(tableId, { limit: 100000 });
    let updatedRecords = 0;
    const statements = [];

    for (const record of records) {
      const nextFields = { ...record.fields };
      let changed = false;
      for (const field of formulaFields) {
        const expression = field.options?.expression ?? field.meta?.expression;
        if (!expression) continue;
        let nextValue = null;
        try {
          const sourceFields = { ...nextFields, [field.id]: record.fields[field.id] };
          nextValue = evaluateFormulaExpression(expression, sourceFields, fieldByName);
        } catch {
          nextValue = null;
        }
        if (JSON.stringify(nextFields[field.id] ?? null) !== JSON.stringify(nextValue ?? null)) {
          nextFields[field.id] = nextValue;
          changed = true;
        }
      }
      if (!changed) continue;
      updatedRecords += 1;
      statements.push(
        `UPDATE mochi_record
         SET fields_json = ${jsonValue(nextFields)},
             version = version + 1,
             last_modified_time = ${nowExpr}
         WHERE id = ${sqlValue(record.id)};`,
        ...this.recordSearchStatements(tableId, record.id, nextFields)
      );
    }

    if (statements.length > 0) this.db.transaction(statements);
    return { tableId, fields: formulaFields.length, records: records.length, updatedRecords };
  }

  deleteRecord(id, options = {}) {
    const current = this.getRecord(id);
    if (!current) return null;
    const batchId = options.batchId ?? ids.opBatch();
    const statements = [
      `UPDATE mochi_comment
       SET deleted_time = ${nowExpr},
           last_modified_time = ${nowExpr}
       WHERE record_id = ${sqlValue(id)} AND deleted_time IS NULL;`,
      `UPDATE mochi_record
       SET deleted_time = ${nowExpr}, version = version + 1
       WHERE id = ${sqlValue(id)};`,
      `INSERT INTO mochi_trash (id, resource_type, resource_id, parent_resource_id, snapshot_json)
       VALUES (
         ${sqlValue(ids.trash())},
         'record',
         ${sqlValue(id)},
         ${sqlValue(current.table_id)},
         ${jsonValue(current)}
       );`,
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
      `DELETE FROM mochi_record_fts WHERE record_id = ${sqlValue(id)};`,
    ];
    this.db.transaction(statements);
    return current;
  }

  mapComment(row) {
    if (!row) return null;
    return {
      id: row.id,
      tableId: row.table_id,
      recordId: row.record_id,
      content: parseJson(row.content_json, []),
      quoteId: row.quote_id ?? undefined,
      createdBy: {
        id: row.created_by,
        name: row.created_by === 'usr_mochi_local' ? 'Mochi Local' : row.created_by,
        avatar: null,
      },
      reaction: parseJson(row.reaction_json, []),
      createdTime: row.created_time,
      lastModifiedTime: row.last_modified_time ?? undefined,
      deletedTime: row.deleted_time ?? undefined,
    };
  }

  getComment(tableId, recordId, commentId) {
    return this.mapComment(
      this.db.get(`
        SELECT *
        FROM mochi_comment
        WHERE id = ${sqlValue(commentId)}
          AND table_id = ${sqlValue(tableId)}
          AND record_id = ${sqlValue(recordId)}
          AND deleted_time IS NULL;
      `)
    );
  }

  listComments(tableId, recordId, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit ?? 20), 1000));
    return this.db
      .all(
        `
        SELECT *
        FROM mochi_comment
        WHERE table_id = ${sqlValue(tableId)}
          AND record_id = ${sqlValue(recordId)}
          AND deleted_time IS NULL
        ORDER BY created_time ASC, id ASC
        LIMIT ${limit};
      `
      )
      .map((row) => this.mapComment(row));
  }

  countComments(tableId) {
    return this.db.all(`
      SELECT record_id AS recordId, COUNT(*) AS count
      FROM mochi_comment
      WHERE table_id = ${sqlValue(tableId)} AND deleted_time IS NULL
      GROUP BY record_id
      ORDER BY record_id;
    `);
  }

  countRecordComments(tableId, recordId) {
    const row = this.db.get(`
      SELECT COUNT(*) AS count
      FROM mochi_comment
      WHERE table_id = ${sqlValue(tableId)}
        AND record_id = ${sqlValue(recordId)}
        AND deleted_time IS NULL;
    `);
    return Number(row?.count ?? 0);
  }

  createComment(input) {
    const id = input.id ?? ids.comment();
    this.db.run(`
      INSERT INTO mochi_comment (
        id, table_id, record_id, content_json, quote_id, created_by, reaction_json
      )
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.tableId)},
        ${sqlValue(input.recordId)},
        ${jsonValue(input.content ?? [])},
        ${sqlValue(input.quoteId)},
        ${sqlValue(input.createdBy ?? 'usr_mochi_local')},
        ${jsonValue(input.reaction ?? [])}
      );
    `);
    return this.getComment(input.tableId, input.recordId, id);
  }

  updateComment(tableId, recordId, commentId, patch = {}) {
    const current = this.getComment(tableId, recordId, commentId);
    if (!current) return null;
    this.db.run(`
      UPDATE mochi_comment
      SET content_json = ${
        patch.content === undefined ? jsonValue(current.content ?? []) : jsonValue(patch.content)
      },
          last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(commentId)}
        AND table_id = ${sqlValue(tableId)}
        AND record_id = ${sqlValue(recordId)}
        AND deleted_time IS NULL;
    `);
    return this.getComment(tableId, recordId, commentId);
  }

  deleteComment(tableId, recordId, commentId) {
    const current = this.getComment(tableId, recordId, commentId);
    if (!current) return null;
    this.db.run(`
      UPDATE mochi_comment
      SET deleted_time = ${nowExpr},
          last_modified_time = ${nowExpr}
      WHERE id = ${sqlValue(commentId)}
        AND table_id = ${sqlValue(tableId)}
        AND record_id = ${sqlValue(recordId)}
        AND deleted_time IS NULL;
    `);
    return current;
  }

  recordSearchStatements(tableId, recordId, fields) {
    return [
      `DELETE FROM mochi_record_fts WHERE record_id = ${sqlValue(recordId)};`,
      `INSERT INTO mochi_record_fts (table_id, record_id, content)
       VALUES (${sqlValue(tableId)}, ${sqlValue(recordId)}, ${sqlValue(flattenSearchText(fields))});`,
    ];
  }

  searchRecordIds(tableId, search) {
    const query = String(search ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `${token.replaceAll('"', '""')}*`)
      .join(' ');
    if (!query) return [];
    try {
      return this.db
        .all(
          `
          SELECT record_id
          FROM mochi_record_fts
          WHERE table_id = ${sqlValue(tableId)} AND mochi_record_fts MATCH ${sqlValue(query)}
          LIMIT 10000;
        `
        )
        .map((row) => row.record_id);
    } catch {
      return [];
    }
  }

  rebuildSearchIndex(tableId) {
    const records = this.listRecords(tableId, { limit: 100000 });
    const statements = [`DELETE FROM mochi_record_fts WHERE table_id = ${sqlValue(tableId)};`];
    for (const record of records) {
      statements.push(...this.recordSearchStatements(tableId, record.id, record.fields));
    }
    this.db.transaction(statements);
    return { tableId, indexedRecords: records.length };
  }

  listTrash() {
    return this.db
      .all(`SELECT * FROM mochi_trash ORDER BY created_time DESC;`)
      .map((item) => ({ ...item, snapshot: parseJson(item.snapshot_json, {}) }));
  }

  restoreTrash(id) {
    const item = this.db.get(`SELECT * FROM mochi_trash WHERE id = ${sqlValue(id)};`);
    if (!item) return null;
    const snapshot = parseJson(item.snapshot_json, {});
    if (item.resource_type === 'record' && snapshot.id) {
      const fields = snapshot.fields ?? parseJson(snapshot.fields_json, {});
      const statements = [
        `UPDATE mochi_record
         SET deleted_time = NULL,
             fields_json = ${jsonValue(fields)},
             order_json = ${snapshot.order === undefined || snapshot.order === null ? 'NULL' : jsonValue(snapshot.order)},
             version = version + 1,
             last_modified_time = ${nowExpr}
         WHERE id = ${sqlValue(snapshot.id)};`,
        ...this.recordSearchStatements(snapshot.table_id, snapshot.id, fields),
        `DELETE FROM mochi_trash WHERE id = ${sqlValue(id)};`,
      ];
      this.db.transaction(statements);
      return this.getRecord(snapshot.id);
    }
    return null;
  }

  createAttachment(input) {
    const id = input.id ?? ids.attachment();
    this.db.run(`
      INSERT INTO mochi_attachment (
        id, token, name, hash, size, mimetype, path, width, height, thumbnail_path
      )
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.token ?? id)},
        ${sqlValue(input.name)},
        ${sqlValue(input.hash)},
        ${sqlValue(input.size)},
        ${sqlValue(input.mimetype)},
        ${sqlValue(input.path)},
        ${sqlValue(input.width)},
        ${sqlValue(input.height)},
        ${sqlValue(input.thumbnailPath)}
      );
    `);
    return this.getAttachment(id);
  }

  getAttachment(id) {
    return this.db.get(`SELECT * FROM mochi_attachment WHERE id = ${sqlValue(id)};`);
  }

  listAttachments() {
    return this.db.all(
      `SELECT * FROM mochi_attachment WHERE deleted_time IS NULL ORDER BY created_time DESC;`
    );
  }

  attachToRecord(input) {
    const id = input.id ?? ids.attachmentRef();
    this.db.run(`
      INSERT INTO mochi_attachment_ref (id, attachment_id, table_id, record_id, field_id)
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.attachmentId)},
        ${sqlValue(input.tableId)},
        ${sqlValue(input.recordId)},
        ${sqlValue(input.fieldId)}
      );
    `);
    return this.db.get(`SELECT * FROM mochi_attachment_ref WHERE id = ${sqlValue(id)};`);
  }

  listRecordAttachments(recordId) {
    return this.db.all(`
      SELECT r.*, a.name, a.token, a.path, a.mimetype, a.size, a.width, a.height, a.thumbnail_path
      FROM mochi_attachment_ref r
      JOIN mochi_attachment a ON a.id = r.attachment_id
      WHERE r.record_id = ${sqlValue(recordId)} AND a.deleted_time IS NULL
      ORDER BY r.created_time;
    `);
  }

  deleteAttachment(id) {
    const attachment = this.getAttachment(id);
    if (!attachment) return null;
    this.db.run(
      `UPDATE mochi_attachment SET deleted_time = ${nowExpr} WHERE id = ${sqlValue(id)};`
    );
    return attachment;
  }

  listImportSources() {
    return this.db
      .all(`SELECT * FROM mochi_import_source ORDER BY created_time DESC;`)
      .map((source) => ({ ...source, state: parseJson(source.state_json, {}) }));
  }

  createImportSource(input) {
    const id = input.id ?? ids.importSource();
    this.db.run(`
      INSERT INTO mochi_import_source (id, kind, path, profile_id, table_id, state_json)
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.kind ?? 'sqlite')},
        ${sqlValue(input.path)},
        ${sqlValue(input.profileId)},
        ${sqlValue(input.tableId)},
        ${input.state === undefined ? 'NULL' : jsonValue(input.state)}
      );
    `);
    return this.db.get(`SELECT * FROM mochi_import_source WHERE id = ${sqlValue(id)};`);
  }

  importSqliteDatabase(input) {
    const sourceDb = new SqliteCli(input.path);
    const sourceTables = sourceDb
      .all(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '%_fts%'
        ORDER BY name;
      `
      )
      .map((row) => row.name)
      .filter((name) => !input.tables || input.tables.includes(name));
    const base =
      input.baseId && this.getBase(input.baseId)
        ? this.getBase(input.baseId)
        : this.createBase({
            name: input.baseName ?? path.basename(input.path, path.extname(input.path)),
            spaceId: input.spaceId,
          });
    const importedTables = [];

    for (const sourceTable of sourceTables) {
      const rows = sourceDb.all(
        `SELECT * FROM "${sourceTable.replaceAll('"', '""')}" LIMIT ${Number(input.limit ?? 10000)};`
      );
      const table = this.createTable({
        baseId: base.id,
        name: input.tableNamePrefix ? `${input.tableNamePrefix}${sourceTable}` : sourceTable,
      });
      const columnNames = Object.keys(rows[0] ?? {});
      const fields = new Map();
      for (const columnName of columnNames) {
        const sample = rows.find(
          (row) => row[columnName] !== null && row[columnName] !== undefined
        )?.[columnName];
        const inferred = inferFieldType(sample);
        const field = this.createField({
          tableId: table.id,
          name: columnName,
          type: inferred.type,
          cellValueType: inferred.cellValueType,
        });
        fields.set(columnName, field.id);
      }
      for (const row of rows) {
        const recordFields = {};
        for (const [columnName, value] of Object.entries(row)) {
          recordFields[fields.get(columnName)] = value;
        }
        this.createRecord({
          tableId: table.id,
          fields: recordFields,
          label: 'Import SQLite row',
          source: 'import',
        });
      }
      const importSource = this.createImportSource({
        kind: 'sqlite',
        path: input.path,
        profileId: input.profileId,
        tableId: table.id,
        state: { sourceTable, importedRows: rows.length },
      });
      importedTables.push({
        sourceTable,
        table,
        fields: [...fields.values()],
        rows: rows.length,
        importSource,
      });
    }

    return { base, importedTables };
  }

  enqueueComputedJob(input) {
    const id = input.id ?? ids.computedJob();
    this.db.run(`
      INSERT INTO mochi_computed_job (id, table_id, record_id, field_id, job_type, payload_json)
      VALUES (
        ${sqlValue(id)},
        ${sqlValue(input.tableId)},
        ${sqlValue(input.recordId)},
        ${sqlValue(input.fieldId)},
        ${sqlValue(input.jobType ?? 'computed.refresh')},
        ${input.payload === undefined ? 'NULL' : jsonValue(input.payload)}
      );
    `);
    return this.db.get(`SELECT * FROM mochi_computed_job WHERE id = ${sqlValue(id)};`);
  }

  listComputedJobs(status = 'pending') {
    return this.db
      .all(
        `
        SELECT * FROM mochi_computed_job
        WHERE status = ${sqlValue(status)}
        ORDER BY created_time;
      `
      )
      .map((job) => ({ ...job, payload: parseJson(job.payload_json, {}) }));
  }

  claimNextComputedJob() {
    const job = this.db.get(`
      SELECT * FROM mochi_computed_job
      WHERE status = 'pending'
      ORDER BY created_time
      LIMIT 1;
    `);
    if (!job) return null;
    this.db.run(`
      UPDATE mochi_computed_job
      SET status = 'running', attempts = attempts + 1, claimed_time = ${nowExpr}
      WHERE id = ${sqlValue(job.id)};
    `);
    return this.db.get(`SELECT * FROM mochi_computed_job WHERE id = ${sqlValue(job.id)};`);
  }

  completeComputedJob(id) {
    this.db.run(`
      UPDATE mochi_computed_job
      SET status = 'completed', completed_time = ${nowExpr}, error = NULL
      WHERE id = ${sqlValue(id)};
    `);
    return this.db.get(`SELECT * FROM mochi_computed_job WHERE id = ${sqlValue(id)};`);
  }

  failComputedJob(id, error) {
    this.db.run(`
      UPDATE mochi_computed_job
      SET status = 'failed', error = ${sqlValue(error)}, completed_time = ${nowExpr}
      WHERE id = ${sqlValue(id)};
    `);
    return this.db.get(`SELECT * FROM mochi_computed_job WHERE id = ${sqlValue(id)};`);
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
          `UPDATE mochi_record SET deleted_time = ${nowExpr}, version = version + 1 WHERE id = ${sqlValue(op.record_id)};`,
          `DELETE FROM mochi_record_fts WHERE record_id = ${sqlValue(op.record_id)};`
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
        statements.push(
          ...this.recordSearchStatements(op.table_id, op.record_id, before?.fields ?? {})
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
        statements.push(
          ...this.recordSearchStatements(op.table_id, op.record_id, after?.fields ?? {})
        );
      }
      if (op.op_type === 'record.delete') {
        statements.push(
          `UPDATE mochi_record SET deleted_time = ${nowExpr}, version = version + 1 WHERE id = ${sqlValue(op.record_id)};`,
          `DELETE FROM mochi_record_fts WHERE record_id = ${sqlValue(op.record_id)};`
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
