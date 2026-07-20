import path from 'node:path';

export const MOCHI_SQLITE_REPOSITORY = Symbol('MOCHI_SQLITE_REPOSITORY');

const DEFAULT_MOCHI_SQLITE_DATABASE_PATH = './data/mochi-table.sqlite';
const MOCHI_PROFILE_DATABASE_FILE = 'data.sqlite';

const isMochiWorkspacePath = (profileDbPath: string) =>
  path.basename(path.normalize(profileDbPath)) === '.mochi' ||
  path.extname(path.normalize(profileDbPath)) === '.mochi';

export const resolveMochiProfileDatabasePath = (profileDbPath: string) => {
  const normalizedProfileDbPath = path.normalize(profileDbPath);
  return isMochiWorkspacePath(normalizedProfileDbPath)
    ? path.join(normalizedProfileDbPath, MOCHI_PROFILE_DATABASE_FILE)
    : normalizedProfileDbPath;
};

export const getMochiSqliteDatabasePath = () => {
  const profileDbPath = process.env.MOCHI_PROFILE_DB;
  if (profileDbPath) {
    return resolveMochiProfileDatabasePath(profileDbPath);
  }

  return process.env.MOCHI_SQLITE_DATABASE_PATH || DEFAULT_MOCHI_SQLITE_DATABASE_PATH;
};
