import { spawnSync } from 'node:child_process';

export class SqliteCliError extends Error {
  constructor(message, result) {
    super(message);
    this.name = 'SqliteCliError';
    this.status = result?.status;
    this.stderr = result?.stderr;
  }
}

export const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${text.replaceAll("'", "''")}'`;
};

export const jsonValue = (value) => sqlValue(JSON.stringify(value ?? null));

export class SqliteCli {
  constructor(dbPath) {
    this.dbPath = dbPath;
  }

  run(sql) {
    const result = spawnSync('sqlite3', [this.dbPath], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new SqliteCliError(result.stderr || `sqlite3 exited with ${result.status}`, result);
    }
    return result.stdout;
  }

  all(sql) {
    const result = spawnSync('sqlite3', ['-json', this.dbPath, sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new SqliteCliError(result.stderr || `sqlite3 exited with ${result.status}`, result);
    }
    const output = result.stdout.trim();
    return output ? JSON.parse(output) : [];
  }

  get(sql) {
    return this.all(sql)[0] ?? null;
  }

  transaction(statements) {
    this.run(['BEGIN IMMEDIATE;', ...statements, 'COMMIT;'].join('\n'));
  }
}
