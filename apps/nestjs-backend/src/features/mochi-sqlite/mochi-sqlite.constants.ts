export const MOCHI_SQLITE_REPOSITORY = Symbol('MOCHI_SQLITE_REPOSITORY');

export const getMochiSqliteDatabasePath = () =>
  process.env.MOCHI_SQLITE_DATABASE_PATH || './data/mochi-table.sqlite';
