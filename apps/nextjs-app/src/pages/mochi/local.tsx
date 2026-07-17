import type { FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Space = {
  id: string;
  name: string;
};

type Base = {
  id: string;
  name: string;
};

type Table = {
  id: string;
  name: string;
};

type Field = {
  id: string;
  name: string;
  type: string;
  is_primary?: number;
  is_computed?: number;
  is_lookup?: number;
};

type RecordRow = {
  id: string;
  auto_number?: number;
  fields: Record<string, unknown>;
};

type EditingCell = {
  recordId: string;
  fieldId: string;
  value: string;
};

const fieldTypes = [
  { label: 'Text', type: 'singleLineText', cellValueType: 'string' },
  { label: 'Number', type: 'number', cellValueType: 'number' },
  { label: 'Date', type: 'date', cellValueType: 'dateTime' },
  { label: 'Checkbox', type: 'checkbox', cellValueType: 'boolean' },
  { label: 'Single select', type: 'singleSelect', cellValueType: 'string' },
  { label: 'Multiple select', type: 'multipleSelect', cellValueType: 'string' },
] as const;

const apiBase = process.env.NEXT_PUBLIC_MOCHI_API_BASE_URL ?? '';

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

const stringifyCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const parseCellInput = (field: Field, value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (field.type === 'number') {
    const numberValue = Number(trimmed);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  if (field.type === 'checkbox') {
    return ['true', '1', 'yes', 'on', 'checked'].includes(trimmed.toLowerCase());
  }
  if (field.type === 'multipleSelect') {
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
};

export default function MochiLocalPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [search, setSearch] = useState('');
  const [baseName, setBaseName] = useState('Local Base');
  const [tableName, setTableName] = useState('Customers');
  const [fieldName, setFieldName] = useState('Phone');
  const [fieldType, setFieldType] = useState<(typeof fieldTypes)[number]['type']>('singleLineText');
  const [recordText, setRecordText] = useState('');
  const [importPath, setImportPath] = useState('');
  const [status, setStatus] = useState('Ready');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const selectedSpaceId = spaces[0]?.id ?? 'spc_local';
  const writableFields = useMemo(
    () => fields.filter((field) => !field.is_computed && !field.is_lookup),
    [fields]
  );
  const selectedFieldType = useMemo(
    () => fieldTypes.find((option) => option.type === fieldType) ?? fieldTypes[0],
    [fieldType]
  );

  const loadSpaces = useCallback(async () => {
    const nextSpaces = await api<Space[]>('/api/mochi/spaces');
    setSpaces(nextSpaces);
    return nextSpaces;
  }, []);

  const loadBases = useCallback(async () => {
    const nextBases = await api<Base[]>(
      `/api/mochi/bases?spaceId=${encodeURIComponent(selectedSpaceId)}`
    );
    setBases(nextBases);
    setSelectedBaseId((current) => current || nextBases[0]?.id || '');
    return nextBases;
  }, [selectedSpaceId]);

  const loadTables = useCallback(
    async (baseId = selectedBaseId) => {
      if (!baseId) {
        setTables([]);
        setSelectedTableId('');
        return [];
      }
      const nextTables = await api<Table[]>(`/api/mochi/bases/${baseId}/tables`);
      setTables(nextTables);
      setSelectedTableId((current) => current || nextTables[0]?.id || '');
      return nextTables;
    },
    [selectedBaseId]
  );

  const loadTableData = useCallback(
    async (tableId = selectedTableId) => {
      if (!tableId) {
        setFields([]);
        setRecords([]);
        return;
      }
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const [nextFields, nextRecords] = await Promise.all([
        api<Field[]>(`/api/mochi/tables/${tableId}/fields`),
        api<RecordRow[]>(`/api/mochi/tables/${tableId}/records${query}`),
      ]);
      setFields(nextFields);
      setRecords(nextRecords);
    },
    [search, selectedTableId]
  );

  const refreshAll = useCallback(async () => {
    setStatus('Loading local SQLite workspace');
    const nextSpaces = await loadSpaces();
    const nextBases = await api<Base[]>(
      `/api/mochi/bases?spaceId=${encodeURIComponent(nextSpaces[0]?.id ?? selectedSpaceId)}`
    );
    setBases(nextBases);
    const baseId = selectedBaseId || nextBases[0]?.id || '';
    setSelectedBaseId(baseId);
    const nextTables = baseId ? await loadTables(baseId) : [];
    const tableId = selectedTableId || nextTables[0]?.id || '';
    setSelectedTableId(tableId);
    if (tableId) await loadTableData(tableId);
    setStatus('Ready');
  }, [loadSpaces, loadTableData, loadTables, selectedBaseId, selectedSpaceId, selectedTableId]);

  useEffect(() => {
    refreshAll().catch((error) => setStatus(error.message));
  }, [refreshAll]);

  useEffect(() => {
    loadTables().catch((error) => setStatus(error.message));
  }, [loadTables]);

  useEffect(() => {
    loadTableData().catch((error) => setStatus(error.message));
  }, [loadTableData]);

  const createBase = async (event: FormEvent) => {
    event.preventDefault();
    const created = await api<Base>('/api/mochi/bases', {
      method: 'POST',
      body: JSON.stringify({ name: baseName, spaceId: selectedSpaceId }),
    });
    setSelectedBaseId(created.id);
    setStatus(`Created base ${created.name}`);
    await loadBases();
  };

  const createTable = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBaseId) return;
    const created = await api<Table>(`/api/mochi/bases/${selectedBaseId}/tables`, {
      method: 'POST',
      body: JSON.stringify({ name: tableName, primaryFieldName: 'Name' }),
    });
    setSelectedTableId(created.id);
    setStatus(`Created table ${created.name}`);
    await loadTables(selectedBaseId);
    await loadTableData(created.id);
  };

  const createField = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTableId) return;
    await api<Field>(`/api/mochi/tables/${selectedTableId}/fields`, {
      method: 'POST',
      body: JSON.stringify({
        name: fieldName,
        type: selectedFieldType.type,
        cellValueType: selectedFieldType.cellValueType,
      }),
    });
    setStatus(`Created field ${fieldName}`);
    await loadTableData(selectedTableId);
  };

  const createRecord = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTableId) return;
    const targetField = writableFields[0] ?? fields[0];
    if (!targetField) return;
    await api<RecordRow>(`/api/mochi/tables/${selectedTableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ fields: { [targetField.id]: recordText || 'New local row' } }),
    });
    setRecordText('');
    setStatus('Created record');
    await loadTableData(selectedTableId);
  };

  const saveCell = async (record: RecordRow, field: Field, value: string) => {
    if (!selectedTableId || field.is_computed || field.is_lookup) return;
    const nextValue = parseCellInput(field, value);
    await api<RecordRow>(`/api/mochi/records/${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { [field.id]: nextValue } }),
    });
    setEditingCell(null);
    setStatus(`Saved ${field.name}`);
    await loadTableData(selectedTableId);
  };

  const handleCellKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setEditingCell(null);
      return;
    }
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!selectedTableId) return;
    await api(`/api/mochi/records/${recordId}`, { method: 'DELETE' });
    setStatus('Deleted record');
    await loadTableData(selectedTableId);
  };

  const importSqlite = async (event: FormEvent) => {
    event.preventDefault();
    if (!importPath) return;
    await api('/api/mochi/imports/sqlite', {
      method: 'POST',
      body: JSON.stringify({ path: importPath, baseName: 'Imported SQLite', limit: 10000 }),
    });
    setStatus('Imported SQLite database');
    await refreshAll();
  };

  const postAction = async (path: string, label: string) => {
    await api(path, { method: 'POST', body: JSON.stringify({}) });
    setStatus(label);
    await loadTableData(selectedTableId);
  };

  return (
    <main className="mochiLocal">
      <aside className="rail">
        <div>
          <p className="eyebrow">Mochi Table</p>
          <h1>Local Workspace</h1>
        </div>

        <label>
          Base
          <select
            value={selectedBaseId}
            onChange={(event) => setSelectedBaseId(event.target.value)}
          >
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Table
          <select
            value={selectedTableId}
            onChange={(event) => setSelectedTableId(event.target.value)}
          >
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={createBase}>
          <input value={baseName} onChange={(event) => setBaseName(event.target.value)} />
          <button type="submit">Create base</button>
        </form>

        <form onSubmit={createTable}>
          <input value={tableName} onChange={(event) => setTableName(event.target.value)} />
          <button type="submit">Create table</button>
        </form>

        <form onSubmit={importSqlite}>
          <input
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/absolute/path/profile.sqlite"
          />
          <button type="submit">Import SQLite</button>
        </form>
      </aside>

      <section className="workspace">
        <header className="bar">
          <div>
            <strong>
              {tables.find((table) => table.id === selectedTableId)?.name ?? 'No table'}
            </strong>
            <span>{status}</span>
          </div>
          <div className="actions">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search records"
            />
            <button type="button" onClick={() => loadTableData()}>
              Refresh
            </button>
            <button
              type="button"
              onClick={() =>
                selectedTableId &&
                postAction(`/api/mochi/tables/${selectedTableId}/search/rebuild`, 'Rebuilt search')
              }
            >
              Reindex
            </button>
            <button type="button" onClick={() => postAction('/api/mochi/undo', 'Undo complete')}>
              Undo
            </button>
            <button type="button" onClick={() => postAction('/api/mochi/redo', 'Redo complete')}>
              Redo
            </button>
          </div>
        </header>

        <div className="toolbar">
          <form onSubmit={createField}>
            <input value={fieldName} onChange={(event) => setFieldName(event.target.value)} />
            <select
              aria-label="Field type"
              value={fieldType}
              onChange={(event) =>
                setFieldType(event.target.value as (typeof fieldTypes)[number]['type'])
              }
            >
              {fieldTypes.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit">Add field</button>
          </form>
          <form onSubmit={createRecord}>
            <input
              value={recordText}
              onChange={(event) => setRecordText(event.target.value)}
              placeholder="Value for first editable field"
            />
            <button type="submit">Add record</button>
          </form>
        </div>

        <div className="gridWrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {fields.map((field) => (
                  <th key={field.id}>
                    <span>{field.name}</span>
                    <small>{field.type}</small>
                  </th>
                ))}
                <th className="rowActionHead"> </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.auto_number ?? record.id.slice(-4)}</td>
                  {fields.map((field) => {
                    const isEditing =
                      editingCell?.recordId === record.id && editingCell.fieldId === field.id;
                    const rawValue = record.fields?.[field.id];
                    const value = stringifyCell(rawValue);
                    const checked =
                      rawValue === true ||
                      rawValue === 1 ||
                      (typeof rawValue === 'string' && rawValue.toLowerCase() === 'true');
                    const readOnly = Boolean(field.is_computed || field.is_lookup);
                    return (
                      <td key={field.id} className={readOnly ? 'readOnlyCell' : undefined}>
                        {isEditing ? (
                          <input
                            autoFocus
                            className="cellInput"
                            defaultValue={editingCell.value}
                            onBlur={(event) =>
                              saveCell(record, field, event.currentTarget.value).catch((error) =>
                                setStatus(error.message)
                              )
                            }
                            onKeyDown={handleCellKeyDown}
                          />
                        ) : (
                          <button
                            className="cellButton"
                            disabled={readOnly}
                            type="button"
                            onDoubleClick={() =>
                              setEditingCell({ recordId: record.id, fieldId: field.id, value })
                            }
                            title={readOnly ? 'Computed field' : 'Double click to edit'}
                          >
                            {field.type === 'checkbox' ? (checked ? 'Checked' : '') : value}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="rowAction">
                    <button type="button" onClick={() => deleteRecord(record.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={fields.length + 2}>No records yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .mochiLocal {
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr);
          min-height: 100vh;
          overflow: hidden;
          background: #f5f3ee;
          color: #181714;
          font-family:
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            sans-serif;
        }

        .rail {
          display: flex;
          flex-direction: column;
          gap: 18px;
          border-right: 1px solid #d9d2c3;
          background: #ebe5d8;
          padding: 24px;
        }

        .eyebrow {
          margin: 0 0 6px;
          color: #776b57;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
        }

        label,
        form {
          display: grid;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
        }

        input,
        select,
        button {
          min-height: 36px;
          border: 1px solid #c9c1b1;
          border-radius: 6px;
          background: #fffdf8;
          color: inherit;
          font: inherit;
        }

        input,
        select {
          min-width: 0;
          padding: 0 10px;
        }

        button {
          cursor: pointer;
          background: #1f4c45;
          color: #fffdf8;
          font-weight: 800;
        }

        button:hover {
          background: #153b36;
        }

        .workspace {
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          min-width: 0;
        }

        .bar,
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #d9d2c3;
          padding: 14px 18px;
        }

        .bar strong {
          display: block;
          font-size: 18px;
        }

        .bar span {
          color: #776b57;
          font-size: 12px;
        }

        .actions,
        .toolbar form {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .actions input {
          width: 220px;
        }

        .toolbar {
          justify-content: flex-start;
          background: #fffaf0;
        }

        .gridWrap {
          overflow: auto;
          background:
            linear-gradient(#d9d2c3 1px, transparent 1px),
            linear-gradient(90deg, #d9d2c3 1px, transparent 1px);
          background-color: #fffdf8;
          background-size: 42px 42px;
        }

        table {
          width: 100%;
          min-width: 680px;
          border-collapse: collapse;
          background: #fffdf8;
        }

        th,
        td {
          max-width: 280px;
          border-right: 1px solid #e4ddcf;
          border-bottom: 1px solid #e4ddcf;
          padding: 10px 12px;
          overflow: hidden;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #efe7d8;
          color: #4d4537;
          font-size: 12px;
          font-weight: 800;
        }

        th span,
        th small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        th small {
          margin-top: 2px;
          color: #8c806c;
          font-size: 10px;
          font-weight: 700;
        }

        td:first-child,
        th:first-child {
          width: 64px;
          color: #776b57;
        }

        .cellButton {
          display: block;
          width: 100%;
          min-height: 24px;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: inherit;
          font-weight: 500;
          overflow: hidden;
          padding: 0;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cellButton:hover:not(:disabled) {
          background: transparent;
          color: #1f4c45;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .cellButton:disabled {
          cursor: default;
          color: #776b57;
        }

        .cellInput {
          width: 100%;
          min-height: 28px;
          border-color: #1f4c45;
          background: #ffffff;
          box-shadow: inset 0 0 0 1px #1f4c45;
        }

        .readOnlyCell {
          background: #faf6ed;
        }

        .rowActionHead,
        .rowAction {
          width: 92px;
          min-width: 92px;
          text-align: right;
        }

        .rowAction button {
          min-height: 28px;
          border-color: #d7a79b;
          background: #fff7f4;
          color: #8f2f20;
          padding: 0 10px;
        }

        .rowAction button:hover {
          background: #f7dfd8;
        }

        @media (max-width: 820px) {
          .mochiLocal {
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(0, 1fr);
          }

          .rail {
            border-right: 0;
            border-bottom: 1px solid #d9d2c3;
          }

          .bar,
          .toolbar,
          .actions {
            align-items: stretch;
            flex-direction: column;
          }

          .actions input,
          .toolbar form {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
