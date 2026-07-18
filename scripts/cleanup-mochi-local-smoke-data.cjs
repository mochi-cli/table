#!/usr/bin/env node

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dbPath = process.argv[2] ?? path.join(process.cwd(), 'data/mochi-table.sqlite');

async function main() {
  const repositoryUrl = pathToFileURL(
    path.join(process.cwd(), 'packages/mochi-sqlite/src/repository.mjs')
  ).href;
  const { MochiSqliteRepository } = await import(repositoryUrl);
  const repo = new MochiSqliteRepository(dbPath);
  repo.init();

  const bases = repo.listBases();
  const deletedTables = [];
  const deletedViews = [];
  const deletedOrphanViews = [];
  const renamedViews = [];
  const deletedHistoryRows = [];

  for (const base of bases) {
    const tables = repo.listTables(base.id);
    const activeTables = tables.filter((table) => !table.deleted_time);
    const primaryTable =
      activeTables.find((table) => table.name === 'Customers') ?? activeTables[0];

    for (const table of activeTables) {
      const shouldDeleteTable =
        table.id !== primaryTable?.id &&
        (table.name === 'Customers' ||
          table.name === 'New table' ||
          table.name === 'Schema only smoke');
      if (shouldDeleteTable) {
        for (const view of repo.listViews(table.id).filter((item) => !item.deleted_time)) {
          repo.deleteView(view.id);
          deletedViews.push({ id: view.id, name: view.name, tableId: table.id });
        }
        repo.deleteTable(table.id);
        deletedTables.push({ id: table.id, name: table.name });
      }
    }

    if (!primaryTable) continue;

    const views = repo.listViews(primaryTable.id).filter((view) => !view.deleted_time);
    const primaryView =
      views.find((view) => view.name.startsWith('Grid view rt-')) ??
      views.find((view) => view.name === 'Grid view') ??
      views[0];

    for (const view of views) {
      if (
        view.id !== primaryView?.id &&
        ['Gallery', 'Gallery 2', 'Grid view copy'].includes(view.name)
      ) {
        repo.deleteView(view.id);
        deletedViews.push({ id: view.id, name: view.name, tableId: primaryTable.id });
      }
    }

    if (primaryView && primaryView.name !== 'Grid view') {
      repo.updateView(primaryView.id, { name: 'Grid view' });
      renamedViews.push({ id: primaryView.id, from: primaryView.name, to: 'Grid view' });
    }
  }

  const orphanViews = repo.db
    .all(
      `
        SELECT v.id, v.name, v.table_id
        FROM mochi_view v
        JOIN mochi_table t ON t.id = v.table_id
        WHERE v.deleted_time IS NULL AND t.deleted_time IS NOT NULL;
      `
    )
    .map((view) => ({ id: view.id, name: view.name, tableId: view.table_id }));

  for (const view of orphanViews) {
    repo.deleteView(view.id);
    deletedOrphanViews.push(view);
  }

  const historyCleanup = repo.db.get(`
    SELECT COUNT(*) AS count
    FROM mochi_record_history h
    LEFT JOIN mochi_record r ON r.id = h.record_id
    LEFT JOIN mochi_table t ON t.id = h.table_id
    WHERE r.id IS NULL
       OR r.deleted_time IS NOT NULL
       OR t.id IS NULL
       OR t.deleted_time IS NOT NULL;
  `);
  repo.db.run(`
    DELETE FROM mochi_record_history
    WHERE id IN (
      SELECT h.id
      FROM mochi_record_history h
      LEFT JOIN mochi_record r ON r.id = h.record_id
      LEFT JOIN mochi_table t ON t.id = h.table_id
      WHERE r.id IS NULL
         OR r.deleted_time IS NOT NULL
         OR t.id IS NULL
         OR t.deleted_time IS NOT NULL
    );
  `);
  if (historyCleanup?.count) {
    deletedHistoryRows.push({ count: historyCleanup.count });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dbPath,
        deletedTables,
        deletedViews,
        deletedOrphanViews,
        renamedViews,
        deletedHistoryRows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
