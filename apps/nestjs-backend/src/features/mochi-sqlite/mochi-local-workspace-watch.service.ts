import fs from 'node:fs';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { getMochiSqliteDatabasePath } from './mochi-sqlite.constants';
import { MochiSqliteService } from './mochi-sqlite.service';

type LocalBase = {
  id?: string;
};

type LocalTable = {
  id?: string;
};

type LocalRecord = {
  id?: string;
  fields?: Record<string, unknown>;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

type TableSnapshot = {
  recordIds: string[];
  fingerprint: string;
};

const defaultWatchIntervalMs = 1000;
const maxLockedRetries = 5;

const stableJson = (value: unknown): string => {
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
};

const recordFingerprint = (record: LocalRecord) =>
  [
    record.id ?? '',
    typeof record['last_modified_time'] === 'string'
      ? record['last_modified_time']
      : typeof record['created_time'] === 'string'
        ? record['created_time']
        : '',
    stableJson(record.fields ?? record.data ?? {}),
  ].join(':');

const hasSameRecordOrder = (previous: TableSnapshot, recordIds: string[]) =>
  previous.recordIds.join('|') === recordIds.join('|');

const isDatabaseLockedError = (error: unknown) =>
  error instanceof Error && /database is (?:locked|busy)/i.test(error.message);

@Injectable()
export class MochiLocalWorkspaceWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MochiLocalWorkspaceWatchService.name);
  private readonly watchedPaths = new Set<string>();
  private readonly snapshots = new Map<string, TableSnapshot>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private running = false;
  private initialized = false;
  private lockedRetryCount = 0;

  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  onModuleInit() {
    if (!process.env.MOCHI_PROFILE_DB) {
      return;
    }

    const databasePath = getMochiSqliteDatabasePath();
    const interval =
      Number(process.env.MOCHI_LOCAL_WORKSPACE_WATCH_INTERVAL_MS) || defaultWatchIntervalMs;
    [databasePath, `${databasePath}-wal`].forEach((filePath) => {
      fs.watchFile(filePath, { interval }, this.handleFileChange);
      this.watchedPaths.add(filePath);
    });

    void this.refreshSnapshots({ publish: false });
    this.logger.log(`Watching Mochi workspace database for external changes: ${databasePath}`);
  }

  onModuleDestroy() {
    for (const filePath of this.watchedPaths) {
      fs.unwatchFile(filePath, this.handleFileChange);
    }
    this.watchedPaths.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private readonly handleFileChange = (current: fs.Stats, previous: fs.Stats) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
      return;
    }

    this.scheduleRefresh(this.initialized, 250);
  };

  private scheduleRefresh(publish: boolean, delayMs: number) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.refreshSnapshots({ publish });
    }, delayMs);
  }

  private buildTableSnapshot(tableId: string): TableSnapshot {
    const records = this.mochiSqliteService.listRecords(tableId, {
      limit: 100000,
    }) as LocalRecord[];
    const recordIds = records.map((record) => record.id).filter(Boolean) as string[];
    const fingerprint = records.map(recordFingerprint).join('|');
    return { recordIds, fingerprint };
  }

  private publishTableChange(tableId: string, previous: TableSnapshot, next: TableSnapshot) {
    if (previous.fingerprint === next.fingerprint) {
      return;
    }

    this.mochiSqliteService.publishProjectedRecordRefresh(
      tableId,
      hasSameRecordOrder(previous, next.recordIds) ? 'setRecord' : 'addRecord'
    );
  }

  private collectSnapshots(options: { publish: boolean }): Map<string, TableSnapshot> {
    const nextSnapshots = new Map<string, TableSnapshot>();
    const bases = this.mochiSqliteService.listBases('spc_local') as LocalBase[];
    for (const base of bases.filter((item) => item.id)) {
      const tables = this.mochiSqliteService.listTables(base.id as string) as LocalTable[];
      for (const table of tables.filter((item) => item.id)) {
        const tableId = table.id as string;
        const next = this.buildTableSnapshot(tableId);
        const previous = this.snapshots.get(tableId);
        nextSnapshots.set(tableId, next);
        if (options.publish && previous) {
          this.publishTableChange(tableId, previous, next);
        }
      }
    }
    return nextSnapshots;
  }

  private async refreshSnapshots(options: { publish: boolean }) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const nextSnapshots = this.collectSnapshots(options);
      this.snapshots.clear();
      nextSnapshots.forEach((snapshot, tableId) => this.snapshots.set(tableId, snapshot));
      this.initialized = true;
      this.lockedRetryCount = 0;
    } catch (error) {
      if (isDatabaseLockedError(error) && this.lockedRetryCount < maxLockedRetries) {
        this.lockedRetryCount += 1;
        this.scheduleRefresh(options.publish, 250 * this.lockedRetryCount);
        return;
      }

      this.lockedRetryCount = 0;
      this.logger.warn(
        `Failed to refresh Mochi workspace snapshots: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.running = false;
    }
  }
}
