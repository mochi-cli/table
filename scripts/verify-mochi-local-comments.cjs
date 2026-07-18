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
    throw new Error(`${options.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
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

const commentContent = (text) => [{ type: 'p', children: [{ type: 'span', value: text }] }];

async function discoverTarget(origin) {
  const bases = await getJson(`${origin}/api/mochi/bases`);
  const base = bases[0];
  if (!base?.id) throw new Error('No local Mochi base found. Run `make sqlite.init` first.');

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) throw new Error(`No table found in local base ${base.id}.`);

  const fields = await getJson(`${origin}/api/table/${table.id}/field`);
  const primaryField = fields.find((field) => field.is_primary) ?? fields[0];
  if (!primaryField?.id) throw new Error(`No field found in local table ${table.id}.`);

  return { baseId: base.id, tableId: table.id, fieldId: primaryField.id };
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target = await discoverTarget(origin);
  const { tableId, fieldId } = target;
  const marker = `comments-${Date.now()}`;
  let recordId;
  let commentId;
  const results = [];

  try {
    const record = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [fieldId]: `Comment target ${marker}` },
    });
    recordId = record.id;

    const created = await postJson(`${origin}/api/comment/${tableId}/${recordId}/create`, {
      content: commentContent(`Created ${marker}`),
    });
    commentId = created.id;
    results.push({
      name: 'comment-create',
      ok:
        Boolean(commentId) &&
        created.tableId === tableId &&
        created.recordId === recordId &&
        created.createdBy?.id === 'usr_mochi_local',
    });

    const list = await getJson(`${origin}/api/comment/${tableId}/${recordId}/list?take=10`);
    const tableCounts = await getJson(`${origin}/api/comment/${tableId}/count`);
    const recordCount = await getJson(`${origin}/api/comment/${tableId}/${recordId}/count`);
    results.push({
      name: 'comment-list-and-counts',
      ok:
        list.comments?.some((comment) => comment.id === commentId) &&
        tableCounts.some((item) => item.recordId === recordId && Number(item.count) === 1) &&
        Number(recordCount.count) === 1,
    });

    const updated = await patchJson(`${origin}/api/comment/${tableId}/${recordId}/${commentId}`, {
      content: commentContent(`Updated ${marker}`),
    });
    results.push({
      name: 'comment-update',
      ok:
        updated.id === commentId &&
        updated.content?.[0]?.children?.[0]?.value === `Updated ${marker}` &&
        Boolean(updated.lastModifiedTime),
    });

    await deleteJson(`${origin}/api/comment/${tableId}/${recordId}/${commentId}`);
    commentId = undefined;
    const afterDeleteCount = await getJson(`${origin}/api/comment/${tableId}/${recordId}/count`);
    results.push({ name: 'comment-delete', ok: Number(afterDeleteCount.count) === 0 });

    const result = {
      ok: results.every((item) => item.ok),
      target,
      marker,
      results,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (commentId && recordId) {
      await deleteJson(`${origin}/api/comment/${tableId}/${recordId}/${commentId}`).catch(
        () => undefined
      );
    }
    if (recordId) {
      await deleteJson(`${origin}/api/mochi/records/${recordId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
