import { assert, createSourceSqlite, createVerifyRepo } from './verify-utils.mjs';

export const name = 'import-sqlite';

export const run = () => {
  const { repo, tmpDir, dbPath } = createVerifyRepo(name);
  const sourcePath = createSourceSqlite(
    tmpDir,
    "CREATE TABLE customers (name TEXT, phone TEXT, score INTEGER); INSERT INTO customers VALUES ('An', '+84 111', 10), ('Binh', '+84 222', 20);"
  );
  const imported = repo.importSqliteDatabase({ path: sourcePath, baseName: 'Imported' });
  const tableId = imported.importedTables[0].table.id;

  assert.equal(imported.importedTables.length, 1);
  assert.equal(repo.listRecords(tableId).length, 2);
  assert.equal(repo.listRecords(tableId, { search: 'Binh' }).length, 1);

  return { name, dbPath, sourcePath };
};
