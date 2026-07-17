import { Inject, Injectable } from '@nestjs/common';
import { MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';

type JsonRecord = Record<string, unknown>;

type MochiRepository = {
  listSpaces: () => unknown[];
  createSpace: (input: { id?: string; name: string; avatar?: string }) => unknown;
  getSpace: (id: string) => unknown;
  listBases: (spaceId?: string) => unknown[];
  getBase: (id: string) => unknown;
  createBase: (input: { id?: string; name: string; spaceId?: string; icon?: string; order?: number }) => unknown;
  listTables: (baseId: string) => unknown[];
  getTable: (id: string) => unknown;
  createTable: (input: {
    id?: string;
    baseId: string;
    name: string;
    description?: string;
    icon?: string;
    order?: number;
    primaryFieldId?: string;
    primaryFieldName?: string;
    viewId?: string;
  }) => unknown;
  listFields: (tableId: string) => unknown[];
  getField: (id: string) => unknown;
  createField: (input: {
    id?: string;
    tableId: string;
    name: string;
    description?: string;
    type: string;
    cellValueType?: string;
    options?: unknown;
    meta?: unknown;
    aiConfig?: unknown;
    isPrimary?: boolean;
    isComputed?: boolean;
    isLookup?: boolean;
    notNull?: boolean;
    unique?: boolean;
    order?: number;
  }) => unknown;
  updateField: (id: string, patch: JsonRecord) => unknown;
  listViews: (tableId: string) => unknown[];
  createView: (input: {
    tableId: string;
    name: string;
    type?: string;
    options?: unknown;
    columnMeta?: unknown;
    filter?: unknown;
    sort?: unknown;
    group?: unknown;
  }) => unknown;
  getView: (id: string) => unknown;
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
  createRecord: (input: { tableId: string; fields?: JsonRecord }) => unknown;
  getRecord: (id: string) => unknown;
  updateRecord: (id: string, patch: { fields?: JsonRecord }) => unknown;
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

  createSpace(input: { id?: string; name: string; avatar?: string }) {
    return this.repository.createSpace(input);
  }

  getSpace(id: string) {
    return this.repository.getSpace(id);
  }

  listBases(spaceId?: string) {
    return this.repository.listBases(spaceId);
  }

  getBase(id: string) {
    return this.repository.getBase(id);
  }

  createBase(input: { id?: string; name: string; spaceId?: string; icon?: string; order?: number }) {
    return this.repository.createBase(input);
  }

  listTables(baseId: string) {
    return this.repository.listTables(baseId);
  }

  getTable(id: string) {
    return this.repository.getTable(id);
  }

  createTable(input: {
    id?: string;
    baseId: string;
    name: string;
    description?: string;
    icon?: string;
    order?: number;
    primaryFieldId?: string;
    primaryFieldName?: string;
    viewId?: string;
  }) {
    return this.repository.createTable(input);
  }

  listFields(tableId: string) {
    return this.repository.listFields(tableId);
  }

  getField(id: string) {
    return this.repository.getField(id);
  }

  createField(input: {
    id?: string;
    tableId: string;
    name: string;
    description?: string;
    type: string;
    cellValueType?: string;
    options?: unknown;
    meta?: unknown;
    aiConfig?: unknown;
    isPrimary?: boolean;
    isComputed?: boolean;
    isLookup?: boolean;
    notNull?: boolean;
    unique?: boolean;
    order?: number;
  }) {
    return this.repository.createField(input);
  }

  updateField(id: string, patch: JsonRecord) {
    return this.repository.updateField(id, patch);
  }

  listViews(tableId: string) {
    return this.repository.listViews(tableId);
  }

  createView(input: {
    tableId: string;
    name: string;
    type?: string;
    options?: unknown;
    columnMeta?: unknown;
    filter?: unknown;
    sort?: unknown;
    group?: unknown;
  }) {
    return this.repository.createView(input);
  }

  getView(id: string) {
    return this.repository.getView(id);
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

  createRecord(input: { tableId: string; fields?: JsonRecord }) {
    return this.repository.createRecord(input);
  }

  getRecord(id: string) {
    return this.repository.getRecord(id);
  }

  updateRecord(id: string, patch: { fields?: JsonRecord }) {
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
