import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMochiSqliteDatabasePath,
  resolveMochiProfileDatabasePath,
} from './mochi-sqlite.constants';

const originalEnv = { ...process.env };

describe('mochi sqlite constants', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves MOCHI_PROFILE_DB workspace folders to data.sqlite', () => {
    expect(resolveMochiProfileDatabasePath('/tmp/a.mochi')).toBe(
      path.normalize('/tmp/a.mochi/data.sqlite')
    );
    expect(resolveMochiProfileDatabasePath('/tmp/a.mochi/')).toBe(
      path.normalize('/tmp/a.mochi/data.sqlite')
    );
  });

  it('uses MOCHI_PROFILE_DB before MOCHI_SQLITE_DATABASE_PATH', () => {
    process.env.MOCHI_PROFILE_DB = '/tmp/b.mochi';
    process.env.MOCHI_SQLITE_DATABASE_PATH = '/tmp/legacy.sqlite';

    expect(getMochiSqliteDatabasePath()).toBe(path.normalize('/tmp/b.mochi/data.sqlite'));
  });

  it('allows MOCHI_PROFILE_DB to point directly at a sqlite file', () => {
    process.env.MOCHI_PROFILE_DB = '/tmp/direct.sqlite';
    delete process.env.MOCHI_SQLITE_DATABASE_PATH;

    expect(getMochiSqliteDatabasePath()).toBe(path.normalize('/tmp/direct.sqlite'));
  });

  it('falls back to MOCHI_SQLITE_DATABASE_PATH only when MOCHI_PROFILE_DB is unset', () => {
    delete process.env.MOCHI_PROFILE_DB;
    process.env.MOCHI_SQLITE_DATABASE_PATH = '/tmp/legacy.sqlite';

    expect(getMochiSqliteDatabasePath()).toBe('/tmp/legacy.sqlite');
  });
});
