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
    results.push({ name: 'rename', ok: renamed?.id === created.id && renamed.name === `Renamed ${marker}` });

    const converted = await putJson(`${origin}/api/table/${tableId}/field/${created.id}/convert`, {
      type: 'singleLineText',
      cellValueType: 'string',
    });
    results.push({
      name: 'convert',
      ok: converted?.id === created.id && converted.type === 'singleLineText',
    });

    const duplicated = await postJson(`${origin}/api/table/${tableId}/field/${created.id}/duplicate`, {
      name: `Copy ${marker}`,
    });
    createdIds.push(duplicated.id);
    results.push({
      name: 'duplicate',
      ok: Boolean(duplicated?.id) && duplicated.id !== created.id && duplicated.name === `Copy ${marker}`,
    });

    await deleteJson(`${origin}/api/table/${tableId}/field/${duplicated.id}`);
    await deleteJson(`${origin}/api/table/${tableId}/field/${created.id}`);
    createdIds.length = 0;

    const fields = await getJson(`${origin}/api/table/${tableId}/field`);
    const deleted = [created.id, duplicated.id].every(
      (fieldId) => !fields.some((field) => field.id === fieldId)
    );
    results.push({ name: 'delete', ok: deleted });

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
