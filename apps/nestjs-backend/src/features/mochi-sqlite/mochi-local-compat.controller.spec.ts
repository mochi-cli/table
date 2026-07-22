import { NotFoundException } from '@nestjs/common';
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
    listFields: (tableId: string) => [{ id: `fld_${tableId}` }],
    createTable: vi.fn((input: { baseId: string; name: string; icon?: string | null }) => ({
      id: 'tbl_new',
      base_id: input.baseId,
      name: input.name,
      icon: input.icon ?? null,
      sort_order: 2,
    })),
    updateTable: vi.fn(
      (
        id: string,
        patch: { name?: string; icon?: string | null; description?: string | null; order?: number }
      ) => ({
        id,
        name: patch.name ?? 'Customers',
        icon: patch.icon ?? null,
        description: patch.description ?? null,
        sort_order: patch.order ?? 0,
      })
    ),
    duplicateTable: vi.fn((id: string, input: { baseId?: string; name?: string }) => ({
      id: 'tbl_copy',
      base_id: input.baseId,
      name: input.name ?? 'Customers copy',
      icon: null,
      sort_order: 3,
    })),
    deleteTable: vi.fn((id: string) => ({ id, name: 'Customers', sort_order: 0 })),
    permanentDeleteTable: vi.fn((id: string) => ({ id, name: 'Customers', sort_order: 0 })),
    countComments: vi.fn(() => [{ recordId: 'rec_1', count: 1 }]),
    countRecordComments: vi.fn((_tableId: string, recordId: string) =>
      recordId === 'rec_1' ? 1 : 0
    ),
    listComments: vi.fn(() => [
      {
        id: 'com_1',
        tableId: 'tbl_1',
        recordId: 'rec_1',
        content: [
          { type: 'paragraph', children: [{ text: 'Local comment' }] },
          { type: 'img', path: 'data/attachments/mochi_img' },
        ],
      },
    ]),
    listAttachments: vi.fn(() => [
      {
        token: 'mochi_img',
        name: 'local image.jpg',
        path: 'data/attachments/mochi_img',
      },
    ]),
    getComment: vi.fn(() => ({ id: 'com_1', tableId: 'tbl_1', recordId: 'rec_1' })),
    createComment: vi.fn((input) => ({ id: 'com_1', ...input })),
    updateComment: vi.fn((tableId: string, recordId: string, commentId: string, patch) => ({
      id: commentId,
      tableId,
      recordId,
      content: patch.content,
    })),
    deleteComment: vi.fn((tableId: string, recordId: string, commentId: string) => ({
      id: commentId,
      tableId,
      recordId,
    })),
  }) as unknown as MochiSqliteService;

describe('MochiLocalCompatController', () => {
  it('returns local-safe responses for collaboration, indexes, AI, and local comments', () => {
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
    expect(controller.getCommentCountsByQuery('tbl_1')).toEqual([{ recordId: 'rec_1', count: 1 }]);
    expect(controller.getRecordCommentCount('tbl_1', 'rec_1')).toEqual({ count: 1 });
    expect(controller.getCommentList('tbl_1', 'rec_1').comments).toMatchObject([
      {
        content: [
          {},
          {
            type: 'img',
            path: 'data/attachments/mochi_img',
            url: '/api/attachments/read/mochi_img?filename=local%20image.jpg',
          },
        ],
      },
    ]);
    expect(
      controller.createComment('tbl_1', 'rec_1', {
        content: [{ type: 'paragraph', children: [{ text: 'Local comment' }] }],
      })
    ).toMatchObject({ id: 'com_1', tableId: 'tbl_1', recordId: 'rec_1' });
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
      'record|comment': true,
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

    expect(controller.updateTableDescription('tbl_1', { description: 'Local CRM' })).toMatchObject({
      id: 'tbl_1',
      description: 'Local CRM',
    });
    expect(service.updateTable).toHaveBeenCalledWith('tbl_1', { description: 'Local CRM' });

    expect(
      controller.createBaseNode('bas_1', { resourceType: 'table', name: 'Orders' })
    ).toMatchObject({
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

    expect(
      controller.duplicateBaseNode('bas_1', 'tbl_1', { name: 'Customers copy' })
    ).toMatchObject({
      id: 'tbl_copy',
      resourceType: 'table',
      resourceMeta: {
        name: 'Customers copy',
      },
    });
    expect(service.duplicateTable).toHaveBeenCalledWith('tbl_1', {
      baseId: 'bas_1',
      name: 'Customers copy',
      includeRecords: undefined,
    });

    expect(
      controller.moveBaseNode('tbl_1', { anchorId: 'tbl_2', position: 'after' })
    ).toMatchObject({
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
    expect(service.permanentDeleteTable).toHaveBeenCalledWith('tbl_1');
  });

  it('supports Teable table duplicate check and duplicate APIs', () => {
    const service = createService();
    const controller = new MochiLocalCompatController(service);

    expect(controller.duplicateTableCheck()).toEqual({ affectedFields: [] });
    expect(controller.duplicateFieldCheck()).toEqual({ affectedFields: [] });
    expect(
      controller.duplicateTable('bas_1', 'tbl_1', {
        name: 'Customers no records',
        includeRecords: false,
      })
    ).toMatchObject({
      id: 'tbl_copy',
      name: 'Customers no records',
      defaultViewId: 'viw_tbl_copy',
      fields: [{ id: 'fld_tbl_copy' }],
      views: [{ id: 'viw_tbl_copy' }],
      fieldMap: {
        fld_tbl_1: 'fld_tbl_copy',
      },
      viewMap: {
        viw_tbl_1: 'viw_tbl_copy',
      },
    });
    expect(service.duplicateTable).toHaveBeenCalledWith('tbl_1', {
      baseId: 'bas_1',
      name: 'Customers no records',
      includeRecords: false,
    });
  });

  it('returns not found when duplicating a missing table or node', () => {
    const service = createService();
    vi.mocked(service.duplicateTable).mockReturnValue(null);
    const controller = new MochiLocalCompatController(service);

    expect(() => controller.duplicateBaseNode('bas_1', 'tbl_missing', {})).toThrow(
      NotFoundException
    );
    expect(() => controller.duplicateTable('bas_1', 'tbl_missing', {})).toThrow(NotFoundException);
  });
});
