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
const putJson = (url, body) =>
  requestJson(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
const patchJson = (url, body) =>
  requestJson(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

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

  return { baseId: base.id, tableId: table.id };
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3]
      ? { baseId: process.argv[2], tableId: process.argv[3] }
      : await discoverTarget(origin);
  const { tableId } = target;
  const marker = `view-lifecycle-${Date.now()}`;
  const createdIds = [];
  const results = [];

  try {
    const created = await postJson(`${origin}/api/table/${tableId}/view`, {
      name: `Temp ${marker}`,
      type: 'grid',
      options: { rowHeight: 'short' },
    });
    createdIds.push(created.id);
    results.push({ name: 'create', ok: Boolean(created?.id) && created.name === `Temp ${marker}` });

    const duplicated = await postJson(
      `${origin}/api/table/${tableId}/view/${created.id}/duplicate`
    );
    createdIds.push(duplicated.id);
    results.push({
      name: 'duplicate',
      ok:
        Boolean(duplicated?.id) &&
        duplicated.id !== created.id &&
        duplicated.name === `Temp ${marker} copy`,
    });

    await deleteJson(`${origin}/api/table/${tableId}/view/${duplicated.id}`);
    await deleteJson(`${origin}/api/table/${tableId}/view/${created.id}`);
    createdIds.length = 0;

    const views = await getJson(`${origin}/api/table/${tableId}/view`);
    const deleted = [created.id, duplicated.id].every(
      (viewId) => !views.some((view) => view.id === viewId)
    );
    results.push({ name: 'delete', ok: deleted });

    const advancedViewInputs = [
      {
        type: 'kanban',
        options: { stackFieldId: null, coverFit: 'crop' },
        group: [{ fieldId: null, order: 'asc' }],
      },
      {
        type: 'gallery',
        options: { coverFieldId: null, titleFieldId: null, isCoverFit: true },
        columnMeta: {},
      },
      {
        type: 'calendar',
        options: { startDateFieldId: null, endDateFieldId: null },
        filter: { conjunction: 'and', filterSet: [] },
      },
      {
        type: 'form',
        options: { submitLabel: 'Submit', shareAnonymous: false },
        sort: { sortObjs: [] },
      },
    ];

    for (const input of advancedViewInputs) {
      const advanced = await postJson(`${origin}/api/table/${tableId}/view`, {
        name: `Temp ${input.type} ${marker}`,
        type: input.type,
        options: input.options,
        columnMeta: input.columnMeta,
        filter: input.filter,
        sort: input.sort,
        group: input.group,
      });
      createdIds.push(advanced.id);

      const updatedOptions = await patchJson(
        `${origin}/api/table/${tableId}/view/${advanced.id}/options`,
        { options: { ...(input.options ?? {}), localParity: marker } }
      );
      const updatedFilter = await putJson(
        `${origin}/api/table/${tableId}/view/${advanced.id}/filter`,
        { filter: { conjunction: 'and', filterSet: [] } }
      );
      const updatedSort = await putJson(`${origin}/api/table/${tableId}/view/${advanced.id}/sort`, {
        sort: { sortObjs: [] },
      });

      results.push({
        name: `advanced-view-${input.type}-metadata`,
        ok:
          advanced.type === input.type &&
          updatedOptions.options?.localParity === marker &&
          updatedFilter.filter?.conjunction === 'and' &&
          Array.isArray(updatedSort.sort?.sortObjs),
      });

      await deleteJson(`${origin}/api/table/${tableId}/view/${advanced.id}`);
      createdIds.pop();
    }

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
    for (const viewId of createdIds.reverse()) {
      await deleteJson(`${origin}/api/table/${tableId}/view/${viewId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
