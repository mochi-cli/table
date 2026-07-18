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

async function requestText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}`);
  }
  return text;
}

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

  const fields = await getJson(`${origin}/api/table/${table.id}/field`);
  const field = fields[0];
  if (!field?.id) {
    throw new Error(`Table ${table.id} needs at least one field.`);
  }

  return { baseId: base.id, tableId: table.id, fieldId: field.id };
}

const listRecords = (origin, tableId) =>
  getJson(`${origin}/api/table/${tableId}/record?take=100000`).then((json) => json.records ?? []);

const deleteById = (origin, tableId, recordIds) =>
  postJson(`${origin}/api/table/${tableId}/selection/delete-by-id`, {
    selection: { recordIds },
  });

const hasStreamDoneValue = (text, key, value) =>
  text.includes('"id":"done"') && text.includes(`"${key}":${value}`);

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3] && process.argv[4]
      ? { baseId: process.argv[2], tableId: process.argv[3], fieldId: process.argv[4] }
      : await discoverTarget(origin);
  const { tableId, fieldId } = target;
  const marker = `selection-${Date.now()}`;
  const results = [];
  const createdRecordIds = new Set();

  try {
    const created = await postJson(`${origin}/api/table/${tableId}/record`, {
      records: [{ fields: { [fieldId]: `Original ${marker}` } }],
    });
    const recordId = created.records?.[0]?.id;
    if (!recordId) throw new Error('Failed to create temporary record.');
    createdRecordIds.add(recordId);
    results.push({ name: 'create-temp-record', ok: true });

    const preview = await patchJson(`${origin}/api/table/${tableId}/selection/temporaryPaste`, {
      ranges: [
        [0, 0],
        [0, 0],
      ],
      content: `Preview ${marker}`,
    });
    results.push({
      name: 'temporaryPaste-preview',
      ok: preview?.[0]?.fields?.[fieldId] === `Preview ${marker}`,
    });

    const copied = await postJson(`${origin}/api/table/${tableId}/selection/copy-by-id`, {
      selection: { recordIds: [recordId], fieldIds: [fieldId] },
    });
    results.push({ name: 'copy-by-id', ok: copied.content === `Original ${marker}` });

    const pasted = await patchJson(`${origin}/api/table/${tableId}/selection/paste-by-id`, {
      content: `Pasted ${marker}`,
      selection: { recordIds: [recordId], fieldIds: [fieldId] },
    });
    results.push({
      name: 'paste-by-id',
      ok: pasted.pastedRecordIds?.includes(recordId) && pasted.pastedFieldIds?.includes(fieldId),
    });

    await patchJson(`${origin}/api/table/${tableId}/selection/clear-by-id`, {
      selection: { recordIds: [recordId], fieldIds: [fieldId] },
    });
    const afterClear = await listRecords(origin, tableId);
    results.push({
      name: 'clear-by-id',
      ok: afterClear.find((record) => record.id === recordId)?.fields?.[fieldId] == null,
    });

    const pasteStreamText = await requestText(`${origin}/api/table/${tableId}/selection/paste-by-id-stream`, {
      method: 'PATCH',
      body: JSON.stringify({
        content: `Stream ${marker}`,
        selection: { recordIds: [recordId], fieldIds: [fieldId] },
      }),
    });
    results.push({
      name: 'paste-by-id-stream',
      ok: hasStreamDoneValue(pasteStreamText, 'updatedCount', 1),
    });

    const recordsBeforeDuplicate = await listRecords(origin, tableId);
    const rowIndex = recordsBeforeDuplicate.findIndex((record) => record.id === recordId);
    if (rowIndex < 0) throw new Error('Temporary record disappeared before duplicate stream.');

    const ranges = encodeURIComponent(JSON.stringify([[rowIndex, rowIndex]]));
    const duplicateStreamText = await requestText(
      `${origin}/api/table/${tableId}/selection/duplicate-stream?ranges=${ranges}&type=rows`
    );
    const recordsAfterDuplicate = await listRecords(origin, tableId);
    const duplicatedRecords = recordsAfterDuplicate.filter(
      (record) => record.id !== recordId && record.fields?.[fieldId] === `Stream ${marker}`
    );
    duplicatedRecords.forEach((record) => createdRecordIds.add(record.id));
    results.push({
      name: 'duplicate-stream',
      ok:
        hasStreamDoneValue(duplicateStreamText, 'duplicatedCount', 1) &&
        duplicatedRecords.length >= 1,
    });

    if (duplicatedRecords[0]?.id) {
      const deleteStreamText = await requestText(
        `${origin}/api/table/${tableId}/selection/delete-by-id-stream`,
        {
          method: 'PATCH',
          body: JSON.stringify({ selection: { recordIds: [duplicatedRecords[0].id] } }),
        }
      );
      createdRecordIds.delete(duplicatedRecords[0].id);
      results.push({
        name: 'delete-by-id-stream',
        ok: hasStreamDoneValue(deleteStreamText, 'deletedCount', 1),
      });
    }

    await deleteById(origin, tableId, [recordId]);
    createdRecordIds.delete(recordId);
    const recordsAfterDelete = await listRecords(origin, tableId);
    results.push({
      name: 'delete-by-id',
      ok: !recordsAfterDelete.some((record) => record.id === recordId),
    });

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
    if (createdRecordIds.size) {
      await deleteById(origin, tableId, Array.from(createdRecordIds)).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
