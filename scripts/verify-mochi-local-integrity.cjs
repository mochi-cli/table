#!/usr/bin/env node

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dbPath = process.argv[2] ?? path.join(process.cwd(), 'data/mochi-table.sqlite');

const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const columnMetaFieldIds = (columnMeta) => {
  if (Array.isArray(columnMeta)) return columnMeta.map((item) => item?.fieldId).filter(Boolean);
  if (!columnMeta || typeof columnMeta !== 'object') return [];
  return Object.keys(columnMeta);
};

async function main() {
  const repositoryUrl = pathToFileURL(
    path.join(process.cwd(), 'packages/mochi-sqlite/src/repository.mjs')
  ).href;
  const { MochiSqliteRepository } = await import(repositoryUrl);
  const repo = new MochiSqliteRepository(dbPath);
  repo.init();

  const orphanHistory = repo.db.get(`
    SELECT COUNT(*) AS count
    FROM mochi_record_history h
    LEFT JOIN mochi_record r ON r.id = h.record_id
    LEFT JOIN mochi_table t ON t.id = h.table_id
    LEFT JOIN mochi_field f ON f.id = h.field_id
    WHERE r.id IS NULL
       OR r.deleted_time IS NOT NULL
       OR t.id IS NULL
       OR t.deleted_time IS NOT NULL
       OR f.id IS NULL
       OR f.deleted_time IS NOT NULL;
  `);

  const activeFieldIds = new Set(
    repo.db.all(`SELECT id FROM mochi_field WHERE deleted_time IS NULL;`).map((field) => field.id)
  );
  const staleColumnMeta = repo.db
    .all(
      `
        SELECT id, table_id, column_meta_json
        FROM mochi_view
        WHERE deleted_time IS NULL;
      `
    )
    .flatMap((view) =>
      columnMetaFieldIds(parseJson(view.column_meta_json, {}))
        .filter((fieldId) => !activeFieldIds.has(fieldId))
        .map((fieldId) => ({ viewId: view.id, tableId: view.table_id, fieldId }))
    );

  const duplicateActiveViews = repo.db.all(`
    SELECT table_id, name, COUNT(*) AS count
    FROM mochi_view
    WHERE deleted_time IS NULL
    GROUP BY table_id, name
    HAVING COUNT(*) > 1;
  `);

  const result = {
    ok:
      Number(orphanHistory?.count ?? 0) === 0 &&
      staleColumnMeta.length === 0 &&
      duplicateActiveViews.length === 0,
    dbPath,
    orphanHistory: Number(orphanHistory?.count ?? 0),
    staleColumnMeta,
    duplicateActiveViews,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
