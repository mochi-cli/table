#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
const deleteJson = (url) => requestJson(url, { method: 'DELETE' });

async function discoverTarget(origin) {
  const bases = await getJson(`${origin}/api/mochi/bases`);
  const base = bases[0];
  if (!base?.id) throw new Error('No local Mochi base found. Run `make sqlite.init` first.');

  const tables = await getJson(`${origin}/api/mochi/bases/${base.id}/tables`);
  const table = tables[0];
  if (!table?.id) throw new Error(`No table found in local base ${base.id}.`);

  return { baseId: base.id, tableId: table.id };
}

function createSourceSqlite(marker) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-storage-'));
  const sourcePath = path.join(tmpDir, `${marker}.sqlite`);
  const sql = `
    CREATE TABLE contacts (name TEXT, score INTEGER);
    INSERT INTO contacts (name, score) VALUES ('Ada ${marker}', 42), ('Lin ${marker}', 7);
  `;
  const sqlite = spawnSync('sqlite3', [sourcePath, sql], { encoding: 'utf8' });
  if (sqlite.status !== 0) {
    throw new Error(`sqlite3 source creation failed: ${sqlite.stderr || sqlite.stdout}`);
  }
  return sourcePath;
}

async function main() {
  const origin = process.env.MOCHI_BACKEND_ORIGIN ?? 'http://127.0.0.1:3001';
  const target = await discoverTarget(origin);
  const { baseId } = target;
  const marker = `storage-${Date.now()}`;
  const createdTableIds = new Set();
  const results = [];

  try {
    const createdNode = await postJson(`${origin}/api/base/${baseId}/node`, {
      resourceType: 'table',
      name: `Storage ${marker}`,
      icon: 'table-2',
    });
    createdTableIds.add(createdNode.id);
    const tableId = createdNode.id;

    const fields = await getJson(`${origin}/api/mochi/tables/${tableId}/fields`);
    const primaryField = fields[0];
    if (!primaryField?.id) throw new Error(`Temporary table ${tableId} has no primary field.`);

    const attachmentField = await postJson(`${origin}/api/mochi/tables/${tableId}/fields`, {
      name: `Files ${marker}`,
      type: 'attachment',
      cellValueType: 'string',
    });
    const searchable = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [primaryField.id]: `needle ${marker}` },
    });
    const trashRecord = await postJson(`${origin}/api/mochi/tables/${tableId}/records`, {
      fields: { [primaryField.id]: `trash ${marker}` },
    });

    const searchRebuild = await postJson(
      `${origin}/api/mochi/tables/${tableId}/search/rebuild`,
      {}
    );
    const searched = await getJson(
      `${origin}/api/mochi/tables/${tableId}/records?search=${encodeURIComponent(`needle ${marker}`)}`
    );
    results.push({
      name: 'search-rebuild-api',
      ok:
        searchRebuild.tableId === tableId &&
        searchRebuild.indexedRecords >= 2 &&
        searched.some((record) => record.id === searchable.id),
    });

    const deleted = await deleteJson(`${origin}/api/mochi/records/${trashRecord.id}`);
    const trash = await getJson(`${origin}/api/mochi/trash`);
    const trashItem = trash.find((item) => item.resource_id === trashRecord.id);
    const restored = trashItem
      ? await postJson(`${origin}/api/mochi/trash/${trashItem.id}/restore`, {})
      : null;
    results.push({
      name: 'trash-restore-api',
      ok:
        deleted?.id === trashRecord.id &&
        Boolean(trashItem?.id) &&
        restored?.id === trashRecord.id &&
        restored?.deleted_time == null,
    });

    const attachment = await postJson(`${origin}/api/mochi/attachments`, {
      name: `Attachment ${marker}.txt`,
      hash: `hash-${marker}`,
      size: 12,
      mimetype: 'text/plain',
      path: `/tmp/${marker}.txt`,
    });
    const attachmentRef = await postJson(
      `${origin}/api/mochi/records/${searchable.id}/attachments`,
      {
        attachmentId: attachment.id,
        tableId,
        fieldId: attachmentField.id,
      }
    );
    const recordAttachments = await getJson(
      `${origin}/api/mochi/records/${searchable.id}/attachments`
    );
    const listedAttachments = await getJson(`${origin}/api/mochi/attachments`);
    const fetchedAttachment = await getJson(`${origin}/api/mochi/attachments/${attachment.id}`);
    const deletedAttachment = await deleteJson(`${origin}/api/mochi/attachments/${attachment.id}`);
    const listedAfterDelete = await getJson(`${origin}/api/mochi/attachments`);
    results.push({
      name: 'attachment-metadata-api',
      ok:
        attachment.name === `Attachment ${marker}.txt` &&
        attachmentRef.attachment_id === attachment.id &&
        recordAttachments.some((item) => item.attachment_id === attachment.id) &&
        listedAttachments.some((item) => item.id === attachment.id) &&
        fetchedAttachment.id === attachment.id &&
        deletedAttachment.id === attachment.id &&
        !listedAfterDelete.some((item) => item.id === attachment.id),
    });

    const sourcePath = createSourceSqlite(marker);
    const imported = await postJson(`${origin}/api/mochi/imports/sqlite`, {
      path: sourcePath,
      baseId,
      tableNamePrefix: `Import ${marker} `,
      limit: 10,
      profileId: marker,
    });
    for (const importedTable of imported.importedTables ?? []) {
      if (importedTable.table?.id) createdTableIds.add(importedTable.table.id);
    }
    const importedTable = imported.importedTables?.[0]?.table;
    const importedRecords = importedTable?.id
      ? await getJson(`${origin}/api/mochi/tables/${importedTable.id}/records`)
      : [];
    const importSources = await getJson(`${origin}/api/mochi/imports`);
    results.push({
      name: 'sqlite-import-api',
      ok:
        imported.base?.id === baseId &&
        imported.importedTables?.length === 1 &&
        imported.importedTables[0].rows === 2 &&
        importedRecords.length === 2 &&
        importSources.some(
          (source) =>
            source.profile_id === marker &&
            source.table_id === importedTable?.id &&
            source.state?.importedRows === 2
        ),
    });

    const result = {
      ok: results.every((item) => item.ok),
      target,
      marker,
      results,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    for (const tableId of [...createdTableIds].reverse()) {
      await deleteJson(`${origin}/api/base/${baseId}/node/${tableId}`).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
