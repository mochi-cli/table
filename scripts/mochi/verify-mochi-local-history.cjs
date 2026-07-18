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
const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

function countHistoryItems(history, predicate) {
  return history.historyList?.filter(predicate).length ?? 0;
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

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target =
    process.argv[2] && process.argv[3] && process.argv[4]
      ? { baseId: process.argv[2], tableId: process.argv[3], fieldId: process.argv[4] }
      : await discoverTarget(origin);
  const { tableId, fieldId } = target;
  const marker = `history-${Date.now()}`;
  const results = [];
  let recordId;
  let secondaryFieldId;

  try {
    const secondaryField = await postJson(`${origin}/api/table/${tableId}/field`, {
      name: `History verifier ${marker}`,
      type: 'singleLineText',
      cellValueType: 'string',
    });
    secondaryFieldId = secondaryField?.id;
    if (!secondaryFieldId) throw new Error('Failed to create secondary history field.');

    const created = await postJson(`${origin}/api/table/${tableId}/record`, {
      records: [
        {
          fields: {
            [fieldId]: `before ${marker}`,
            [secondaryFieldId]: `secondary before ${marker}`,
          },
        },
      ],
    });
    recordId = created.records?.[0]?.id;
    if (!recordId) throw new Error('Failed to create temporary record for history verification.');

    await patchJson(`${origin}/api/table/${tableId}/record/${recordId}`, {
      record: { fields: { [fieldId]: `after ${marker}` } },
    });
    await patchJson(`${origin}/api/table/${tableId}/record/${recordId}`, {
      record: { fields: { [fieldId]: `final ${marker}` } },
    });
    await patchJson(`${origin}/api/table/${tableId}/record/${recordId}`, {
      record: { fields: { [fieldId]: `final ${marker}` } },
    });

    const afterNoopHistory = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?fieldIds=${fieldId}`
    );
    results.push({
      name: 'record-history-noop-update-skipped',
      ok:
        countHistoryItems(
          afterNoopHistory,
          (item) =>
            item.recordId === recordId &&
            item.fieldId === fieldId &&
            item.before?.data === `final ${marker}` &&
            item.after?.data === `final ${marker}`
        ) === 0,
    });

    await patchJson(`${origin}/api/table/${tableId}/record/${recordId}`, {
      record: {
        fields: {
          [fieldId]: `multi primary ${marker}`,
          [secondaryFieldId]: `multi secondary ${marker}`,
        },
      },
    });

    const recordHistory = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?fieldIds=${fieldId}`
    );
    const latest = recordHistory.historyList?.[0];
    const previous = recordHistory.historyList?.[1];
    results.push({
      name: 'record-history-list',
      ok:
        recordHistory.historyList?.length >= 2 &&
        latest?.before?.data === `final ${marker}` &&
        latest?.after?.data === `multi primary ${marker}` &&
        previous?.before?.data === `after ${marker}` &&
        previous?.after?.data === `final ${marker}` &&
        latest?.before?.meta?.id === fieldId &&
        recordHistory.userMap?.usr_mochi_local?.name === 'Mochi Local',
    });

    const multiFieldHistory = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?fieldIds=${fieldId}&fieldIds=${secondaryFieldId}`
    );
    results.push({
      name: 'record-history-multi-field-update',
      ok:
        multiFieldHistory.historyList?.some(
          (item) =>
            item.recordId === recordId &&
            item.fieldId === fieldId &&
            item.before?.data === `final ${marker}` &&
            item.after?.data === `multi primary ${marker}` &&
            item.after?.meta?.id === fieldId
        ) &&
        multiFieldHistory.historyList?.some(
          (item) =>
            item.recordId === recordId &&
            item.fieldId === secondaryFieldId &&
            item.before?.data === `secondary before ${marker}` &&
            item.after?.data === `multi secondary ${marker}` &&
            item.after?.meta?.id === secondaryFieldId
        ),
    });

    const tableHistory = await getJson(
      `${origin}/api/table/${tableId}/record/history?fieldIds=${fieldId}&createdByIds=usr_mochi_local`
    );
    results.push({
      name: 'table-history-list',
      ok: tableHistory.historyList?.some(
        (item) =>
          item.recordId === recordId &&
          item.fieldId === fieldId &&
          item.after?.data === `multi primary ${marker}`
      ),
    });

    const filteredByOtherUser = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?createdByIds=usr_other`
    );
    results.push({
      name: 'created-by-filter',
      ok:
        Array.isArray(filteredByOtherUser.historyList) &&
        filteredByOtherUser.historyList.length === 0,
    });

    const paged = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?fieldIds=${fieldId}`
    );
    results.push({
      name: 'cursor-shape',
      ok: Object.prototype.hasOwnProperty.call(paged, 'nextCursor'),
    });

    await deleteJson(`${origin}/api/table/${tableId}/record/${recordId}`);
    const afterDeleteHistory = await getJson(
      `${origin}/api/table/${tableId}/record/${recordId}/history?fieldIds=${fieldId}`
    );
    results.push({
      name: 'deleted-record-history-hidden',
      ok:
        Array.isArray(afterDeleteHistory.historyList) &&
        afterDeleteHistory.historyList.length === 0,
    });
    recordId = undefined;

    const result = { ok: results.every((item) => item.ok), target, marker, results };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (recordId) {
      await deleteJson(`${origin}/api/table/${tableId}/record/${recordId}`).catch(() => undefined);
    }
    if (secondaryFieldId) {
      await deleteJson(`${origin}/api/table/${tableId}/field/${secondaryFieldId}`).catch(
        () => undefined
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
