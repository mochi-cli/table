import { describe, expect, it, vi } from 'vitest';
import type { MochiSqliteService } from './mochi-sqlite.service';
import { MochiLocalCompatController } from './mochi-local-compat.controller';

const createService = () =>
  ({
    getBase: () => ({ id: 'bas_1', name: 'Local Base', space_id: 'spc_local' }),
    getTable: (id: string) => ({ id, name: 'Customers', icon: null, sort_order: 0 }),
    listTables: () => [
      { id: 'tbl_1', name: 'Customers', sort_order: 0 },
      { id: 'tbl_2', name: 'Customers', sort_order: 1 },
    ],
    listViews: (tableId: string) => [{ id: `viw_${tableId}` }],
    createTable: vi.fn((input: { baseId: string; name: string; icon?: string | null }) => ({
      id: 'tbl_new',
      base_id: input.baseId,
      name: input.name,
      icon: input.icon ?? null,
      sort_order: 2,
    })),
    updateTable: vi.fn((id: string, patch: { name?: string; icon?: string | null; order?: number }) => ({
      id,
      name: patch.name ?? 'Customers',
      icon: patch.icon ?? null,
      sort_order: patch.order ?? 0,
    })),
    duplicateTable: vi.fn((id: string, input: { baseId?: string; name?: string }) => ({
      id: 'tbl_copy',
      base_id: input.baseId,
      name: input.name ?? 'Customers copy',
      icon: null,
      sort_order: 3,
    })),
    deleteTable: vi.fn((id: string) => ({ id, name: 'Customers', sort_order: 0 })),
  }) as unknown as MochiSqliteService;

describe('MochiLocalCompatController', () => {
  it('returns local-safe empty responses for collaboration, comments, indexes, and AI', () => {
    const controller = new MochiLocalCompatController(createService());

    expect(controller.listBaseShare()).toEqual([]);
    expect(controller.getTemplateByBaseId()).toBeNull();
    expect(controller.getPinList()).toEqual([]);
    expect(controller.getPublicSetting()).toMatchObject({
      instanceId: 'mochi-local',
      disallowSignUp: true,
      aiConfig: {
        enable: false,
        llmProviders: [],
      },
    });
    expect(controller.getTableActivatedIndex()).toEqual([]);
    expect(controller.getTableAbnormalIndex()).toEqual([]);
    expect(controller.getCommentCountsByQuery()).toEqual([]);
    expect(controller.getRecordCommentCount('rec_1')).toEqual({ count: 0 });
    expect(controller.getAiDisableActions()).toEqual({ disableActions: [] });
    expect(controller.getAiConfig()).toMatchObject({
      enable: false,
      llmProviders: [],
      capabilities: {
        disableModelSelection: true,
      },
    });
  });

  it('exposes one local table per name in the Teable sidebar tree', () => {
    const controller = new MochiLocalCompatController(createService());

    expect(controller.getBase('bas_1')).toMatchObject({
      id: 'bas_1',
      spaceId: 'spc_local',
      collaboratorType: 'space',
    });
    expect(controller.getBasePermission()).toMatchObject({
      'table|read': true,
      'record|update': true,
    });
    expect(controller.getTablePermission()).toMatchObject({
      table: { 'table|read': true },
      record: { 'record|update': true },
    });
    expect(controller.getBaseNodeTree('bas_1')).toMatchObject({
      maxFolderDepth: 2,
      nodes: [
        {
          id: 'tbl_1',
          resourceType: 'table',
          defaultUrl: '/mochi/local?tableId=tbl_1&viewId=viw_tbl_1',
          resourceMeta: {
            name: 'Customers',
            defaultViewId: 'viw_tbl_1',
          },
        },
      ],
    });
  });

  it('supports Teable table rename, icon, and node creation APIs', () => {
    const service = createService();
    const controller = new MochiLocalCompatController(service);

    expect(controller.updateTableName('tbl_1', { name: 'Companies' })).toMatchObject({
      id: 'tbl_1',
      name: 'Companies',
    });
    expect(service.updateTable).toHaveBeenCalledWith('tbl_1', { name: 'Companies' });

    expect(controller.updateTableIcon('tbl_1', { icon: 'building-2' })).toMatchObject({
      id: 'tbl_1',
      icon: 'building-2',
    });
    expect(service.updateTable).toHaveBeenCalledWith('tbl_1', { icon: 'building-2' });

    expect(controller.createBaseNode('bas_1', { resourceType: 'table', name: 'Orders' })).toMatchObject({
      id: 'tbl_new',
      resourceType: 'table',
      defaultUrl: '/mochi/local?tableId=tbl_new&viewId=viw_tbl_new',
      resourceMeta: {
        name: 'Orders',
        defaultViewId: 'viw_tbl_new',
      },
    });
    expect(service.createTable).toHaveBeenCalledWith({
      baseId: 'bas_1',
      name: 'Orders',
      icon: null,
      primaryFieldName: 'Name',
    });

    expect(controller.updateBaseNode('tbl_1', { name: 'Customers 2', icon: null })).toMatchObject({
      id: 'tbl_1',
      resourceMeta: {
        name: 'Customers 2',
        icon: null,
      },
    });
  });

  it('supports local-safe duplicate, move, and delete node APIs', () => {
    const service = createService();
    const controller = new MochiLocalCompatController(service);

    expect(controller.duplicateBaseNode('bas_1', 'tbl_1', { name: 'Customers copy' })).toMatchObject({
      id: 'tbl_copy',
      resourceType: 'table',
      resourceMeta: {
        name: 'Customers copy',
      },
    });
    expect(service.duplicateTable).toHaveBeenCalledWith('tbl_1', {
      baseId: 'bas_1',
      name: 'Customers copy',
    });

    expect(controller.moveBaseNode('tbl_1', { anchorId: 'tbl_2', position: 'after' })).toMatchObject({
      id: 'tbl_1',
      order: 0.5,
    });
    expect(service.updateTable).toHaveBeenCalledWith('tbl_1', { order: 0.5 });
    expect(controller.moveBaseNode('tbl_1', {})).toMatchObject({
      id: 'tbl_1',
      order: 0,
    });
    expect(service.updateTable).toHaveBeenCalledWith('tbl_1', { order: 0 });

    expect(controller.deleteBaseNode('tbl_1')).toEqual({
      resourceId: 'tbl_1',
      resourceType: 'table',
      permanent: false,
    });
    expect(controller.permanentDeleteBaseNode('tbl_1')).toEqual({
      resourceId: 'tbl_1',
      resourceType: 'table',
      permanent: true,
    });
  });
});
