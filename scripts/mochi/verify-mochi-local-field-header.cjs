#!/usr/bin/env node

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}`);
  }
  return json;
}

const getJson = (url) => requestJson(url);

const postJson = (url, body) =>
  requestJson(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const patchJson = (url, body) =>
  requestJson(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const putJson = (url, body) =>
  requestJson(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

const columnMetaHasField = (columnMeta, fieldId) => {
  if (Array.isArray(columnMeta)) return columnMeta.some((item) => item?.fieldId === fieldId);
  return Boolean(columnMeta?.[fieldId]);
};

async function discoverTarget(origin) {
  const bases = await getJson(`${origin}/api/mochi/bases`);
  const base = bases[0];
  if (!base?.id) {
    throw new Error('No local Mochi base found. Run `make sqlite.init` first.');
  }

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) {
    throw new Error(`No table found in local base ${base.id}.`);
  }

  const views = await getJson(`${origin}/api/table/${table.id}/view`);
  const view = views[0];
  if (!view?.id) {
    throw new Error(`Table ${table.id} needs at least one view.`);
  }

  return { baseId: base.id, tableId: table.id, viewId: view.id };
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3] && process.argv[4]
      ? { baseId: process.argv[2], tableId: process.argv[3], viewId: process.argv[4] }
      : await discoverTarget(origin);
  const { tableId, viewId } = target;
  const marker = `field-header-${Date.now()}`;
  const createdIds = [];

  const results = [];
  try {
    const created = await postJson(`${origin}/api/table/${tableId}/field`, {
      name: `Temp ${marker}`,
    });
    createdIds.push(created.id);
    results.push({ name: 'create', ok: Boolean(created?.id) && created.name === `Temp ${marker}` });

    const renamed = await patchJson(`${origin}/api/table/${tableId}/field/${created.id}`, {
      name: `Renamed ${marker}`,
    });
    results.push({
      name: 'rename',
      ok: renamed?.id === created.id && renamed.name === `Renamed ${marker}`,
    });

    const converted = await putJson(`${origin}/api/table/${tableId}/field/${created.id}/convert`, {
      type: 'singleLineText',
      cellValueType: 'string',
    });
    results.push({
      name: 'convert',
      ok: converted?.id === created.id && converted.type === 'singleLineText',
    });

    const hiddenView = await putJson(`${origin}/api/table/${tableId}/view/${viewId}/column-meta`, {
      columnMeta: { [created.id]: { hidden: true } },
    });
    results.push({
      name: 'hide-field-column-meta',
      ok: hiddenView?.columnMeta?.[created.id]?.hidden === true,
    });

    const insertLeft = await postJson(`${origin}/api/table/${tableId}/field`, {
      name: `Insert left ${marker}`,
    });
    createdIds.push(insertLeft.id);
    const insertRight = await postJson(`${origin}/api/table/${tableId}/field`, {
      name: `Insert right ${marker}`,
    });
    createdIds.push(insertRight.id);
    const orderedView = await putJson(`${origin}/api/table/${tableId}/view/${viewId}/column-meta`, {
      columnMeta: {
        [insertLeft.id]: { order: -1 },
        [created.id]: { order: 0 },
        [insertRight.id]: { order: 1 },
      },
    });
    results.push({
      name: 'insert-left-right-column-order',
      ok:
        orderedView?.columnMeta?.[insertLeft.id]?.order === -1 &&
        orderedView?.columnMeta?.[created.id]?.order === 0 &&
        orderedView?.columnMeta?.[insertRight.id]?.order === 1,
    });

    const duplicated = await postJson(
      `${origin}/api/table/${tableId}/field/${created.id}/duplicate`,
      {
        name: `Copy ${marker}`,
      }
    );
    createdIds.push(duplicated.id);
    results.push({
      name: 'duplicate',
      ok:
        Boolean(duplicated?.id) &&
        duplicated.id !== created.id &&
        duplicated.name === `Copy ${marker}`,
    });

    const fieldIdsToDelete = [...createdIds];
    for (const fieldId of fieldIdsToDelete.reverse()) {
      await deleteJson(`${origin}/api/table/${tableId}/field/${fieldId}`);
    }
    createdIds.length = 0;

    const fields = await getJson(`${origin}/api/table/${tableId}/field`);
    const deleted = fieldIdsToDelete.every(
      (fieldId) => !fields.some((field) => field.id === fieldId)
    );
    const viewsAfterDelete = await getJson(`${origin}/api/table/${tableId}/view`);
    const deletedColumnMeta = fieldIdsToDelete.every((fieldId) =>
      viewsAfterDelete.every((view) => !columnMetaHasField(view.columnMeta, fieldId))
    );
    results.push({ name: 'delete', ok: deleted && deletedColumnMeta });

    const result = {
      ok: results.every((item) => item.ok),
      target,
      marker,
      results,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    for (const fieldId of createdIds.reverse()) {
      await deleteJson(`${origin}/api/table/${tableId}/field/${fieldId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
