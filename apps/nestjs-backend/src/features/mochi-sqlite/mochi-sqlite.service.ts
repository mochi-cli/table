import { Inject, Injectable } from '@nestjs/common';
import { MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';

type MochiRepository = {
  listSpaces: () => unknown[];
  listBases: (spaceId?: string) => unknown[];
  createBase: (input: { name: string; spaceId?: string; icon?: string }) => unknown;
  listTables: (baseId: string) => unknown[];
  createTable: (input: { baseId: string; name: string; description?: string }) => unknown;
  listFields: (tableId: string) => unknown[];
  createField: (input: {
    tableId: string;
    name: string;
    type: string;
    cellValueType?: string;
  }) => unknown;
  updateField: (id: string, patch: Record<string, unknown>) => unknown;
  listViews: (tableId: string) => unknown[];
  listRecords: (
    tableId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
      filters?: unknown[];
      sorts?: unknown[];
    }
  ) => unknown[];
  createRecord: (input: { tableId: string; fields?: Record<string, unknown> }) => unknown;
  updateRecord: (id: string, patch: { fields?: Record<string, unknown> }) => unknown;
  deleteRecord: (id: string) => unknown;
  undoLastBatch: () => unknown;
  redoLastBatch: () => unknown;
};

@Injectable()
export class MochiSqliteService {
  constructor(@Inject(MOCHI_SQLITE_REPOSITORY) private readonly repository: MochiRepository) {}

  listSpaces() {
    return this.repository.listSpaces();
  }

  listBases(spaceId?: string) {
    return this.repository.listBases(spaceId);
  }

  createBase(input: { name: string; spaceId?: string; icon?: string }) {
    return this.repository.createBase(input);
  }

  listTables(baseId: string) {
    return this.repository.listTables(baseId);
  }

  createTable(input: { baseId: string; name: string; description?: string }) {
    return this.repository.createTable(input);
  }

  listFields(tableId: string) {
    return this.repository.listFields(tableId);
  }

  createField(input: { tableId: string; name: string; type: string; cellValueType?: string }) {
    return this.repository.createField(input);
  }

  updateField(id: string, patch: Record<string, unknown>) {
    return this.repository.updateField(id, patch);
  }

  listViews(tableId: string) {
    return this.repository.listViews(tableId);
  }

  listRecords(
    tableId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
      filters?: unknown[];
      sorts?: unknown[];
    }
  ) {
    return this.repository.listRecords(tableId, options);
  }

  createRecord(input: { tableId: string; fields?: Record<string, unknown> }) {
    return this.repository.createRecord(input);
  }

  updateRecord(id: string, patch: { fields?: Record<string, unknown> }) {
    return this.repository.updateRecord(id, patch);
  }

  deleteRecord(id: string) {
    return this.repository.deleteRecord(id);
  }

  undo() {
    return this.repository.undoLastBatch();
  }

  redo() {
    return this.repository.redoLastBatch();
  }
}
