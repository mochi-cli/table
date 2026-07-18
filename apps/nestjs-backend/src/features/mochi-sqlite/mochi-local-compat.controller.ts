import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MochiSqliteService } from './mochi-sqlite.service';

const localUser = {
  id: 'usr_mochi_local',
  name: 'Mochi Local',
  avatar: null,
};

const localBasePermission = {
  'base|read': true,
  'base|update': true,
  'base|delete': true,
  'base|invite_link': false,
  'base|authority_matrix_config': false,
  'base|query_data': true,
  'table|create': true,
  'table|delete': true,
  'table|read': true,
  'table|update': true,
  'table|import': false,
  'table|export': true,
  'table|trash_read': true,
  'table|trash_update': true,
  'table|trash_reset': true,
  'field|create': true,
  'field|delete': true,
  'field|read': true,
  'field|update': true,
  'view|create': true,
  'view|delete': true,
  'view|read': true,
  'view|update': true,
  'view|share': false,
  'record|create': true,
  'record|delete': true,
  'record|read': true,
  'record|update': true,
  'record|comment': false,
  'record|copy': true,
  'table_record_history|read': true,
  'automation|read': false,
  'automation|create': false,
  'automation|update': false,
  'automation|delete': false,
  'app|read': false,
  'app|create': false,
  'app|update': false,
  'app|delete': false,
};

const localTablePermission = {
  table: {
    'table|create': true,
    'table|delete': true,
    'table|read': true,
    'table|update': true,
    'table|import': false,
    'table|export': true,
    'table|trash_read': true,
    'table|trash_update': true,
    'table|trash_reset': true,
  },
  field: {
    'field|create': true,
    'field|delete': true,
    'field|read': true,
    'field|update': true,
  },
  view: {
    'view|create': true,
    'view|delete': true,
    'view|read': true,
    'view|update': true,
    'view|share': false,
  },
  record: {
    'record|create': true,
    'record|delete': true,
    'record|read': true,
    'record|update': true,
    'record|comment': false,
    'record|copy': true,
  },
};

const localPublicSetting = {
  instanceId: 'mochi-local',
  brandName: 'Mochi Local',
  brandLogo: null,
  disallowSignUp: true,
  disallowSpaceCreation: false,
  disallowSpaceInvitation: true,
  disallowDashboard: false,
  enableEmailVerification: false,
  enableWaitlist: false,
  createdTime: new Date(0).toISOString(),
  aiConfig: {
    enable: false,
    llmProviders: [],
    capabilities: {
      disableActions: [],
      disableModelSelection: true,
    },
    gatewayModels: [],
  },
  appGenerationEnabled: false,
  turnstileSiteKey: null,
  enableCreditReward: false,
  availableIntegrationProviders: [],
};

type LocalBase = {
  id: string;
  name: string;
  space_id?: string;
  icon?: string | null;
  created_time?: string | null;
  last_modified_time?: string | null;
};

type LocalTable = {
  id: string;
  base_id?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order?: number;
  created_time?: string | null;
  last_modified_time?: string | null;
};

type LocalView = {
  id: string;
};

type LocalField = {
  id: string;
};

type DuplicateTableBody = {
  name?: string;
  includeRecords?: boolean;
};

const pickUniqueTablesByName = (tables: LocalTable[]) => {
  const seen = new Set<string>();
  return tables.filter((table) => {
    const key = table.name.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getLocalTableUrl = (tableId: string, viewId?: string | null) => {
  const params = new URLSearchParams({ tableId });
  if (viewId) {
    params.set('viewId', viewId);
  }
  return `/mochi/local?${params.toString()}`;
};

const mapTableNode = (table: LocalTable, defaultViewId: string | null, index = 0) => ({
  id: table.id,
  parentId: null,
  resourceId: table.id,
  resourceType: 'table',
  order: table.sort_order ?? index,
  defaultUrl: getLocalTableUrl(table.id, defaultViewId),
  resourceMeta: {
    id: table.id,
    name: table.name,
    icon: table.icon ?? null,
    defaultViewId,
    createdByUser: localUser,
    createdTime: table.created_time ?? null,
    lastModifiedByUser: localUser,
    lastModifiedTime: table.last_modified_time ?? null,
  },
  children: null,
});

const mapDuplicatedTable = (
  table: LocalTable,
  fields: LocalField[],
  views: LocalView[],
  sourceFields: LocalField[],
  sourceViews: LocalView[]
) => ({
  id: table.id,
  name: table.name,
  dbTableName: table.id.replace(/\W/g, '_').slice(0, 63),
  description: table.description ?? undefined,
  icon: table.icon ?? undefined,
  order: table.sort_order ?? 0,
  lastModifiedTime: table.last_modified_time ?? undefined,
  defaultViewId: views[0]?.id,
  fields,
  views,
  viewMap: Object.fromEntries(
    sourceViews.map((view, index) => [view.id, views[index]?.id]).filter((entry) => entry[1])
  ),
  fieldMap: Object.fromEntries(
    sourceFields.map((field, index) => [field.id, fields[index]?.id]).filter((entry) => entry[1])
  ),
});

const mapBase = (base: LocalBase) => ({
  id: base.id,
  name: base.name,
  spaceId: base.space_id ?? 'spc_local',
  icon: base.icon ?? null,
  role: 'owner',
  collaboratorType: 'space',
  restrictedAuthority: false,
  enabledAuthority: false,
  lastModifiedTime: base.last_modified_time ?? null,
  createdTime: base.created_time ?? null,
  createdBy: localUser.id,
  createdUser: localUser,
  isCanary: false,
  isShared: false,
  v2Status: {
    useV2: false,
    reason: 'disabled',
  },
});

@Public()
@Controller('api')
export class MochiLocalCompatController {
  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  @Get('base/:baseId')
  getBase(@Param('baseId') baseId: string) {
    const base = this.mochiSqliteService.getBase(baseId) as LocalBase | undefined;
    return base
      ? mapBase(base)
      : mapBase({
          id: baseId,
          name: 'Local Base',
          space_id: 'spc_local',
        });
  }

  @Get('base/:baseId/permission')
  getBasePermission() {
    return localBasePermission;
  }

  @Get('base/:baseId/table/:tableId/permission')
  getTablePermission() {
    return localTablePermission;
  }

  @Get('base/:baseId/table/:tableId/duplicate-check')
  duplicateTableCheck() {
    return { affectedFields: [] };
  }

  @Get('base/:baseId/table/:tableId/field/:fieldId/duplicate-check')
  duplicateFieldCheck() {
    return { affectedFields: [] };
  }

  @Post('base/:baseId/table/:tableId/duplicate')
  duplicateTable(
    @Param('baseId') baseId: string,
    @Param('tableId') tableId: string,
    @Body() body: DuplicateTableBody
  ) {
    const sourceFields = this.mochiSqliteService.listFields(tableId) as LocalField[];
    const sourceViews = this.mochiSqliteService.listViews(tableId) as LocalView[];
    const table = this.mochiSqliteService.duplicateTable(tableId, {
      baseId,
      name: body.name,
      includeRecords: body.includeRecords,
    }) as LocalTable;
    const fields = this.mochiSqliteService.listFields(table.id) as LocalField[];
    const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
    return mapDuplicatedTable(table, fields, views, sourceFields, sourceViews);
  }

  @Put('base/:baseId/table/:tableId/name')
  updateTableName(@Param('tableId') tableId: string, @Body() body: { name?: string }) {
    const name = typeof body.name === 'string' && body.name.trim() ? body.name : 'Untitled';
    return this.mochiSqliteService.updateTable(tableId, { name });
  }

  @Put('base/:baseId/table/:tableId/icon')
  updateTableIcon(@Param('tableId') tableId: string, @Body() body: { icon?: string | null }) {
    return this.mochiSqliteService.updateTable(tableId, { icon: body.icon ?? null });
  }

  @Put('base/:baseId/table/:tableId/description')
  updateTableDescription(
    @Param('tableId') tableId: string,
    @Body() body: { description?: string | null }
  ) {
    return this.mochiSqliteService.updateTable(tableId, {
      description: body.description?.trim() ? body.description : null,
    });
  }

  @Get('base/:baseId/node/tree')
  getBaseNodeTree(@Param('baseId') baseId: string) {
    const tables = pickUniqueTablesByName(
      this.mochiSqliteService.listTables(baseId) as LocalTable[]
    );
    return {
      maxFolderDepth: 2,
      nodes: tables.map((table, index) => {
        const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
        const defaultViewId = views[0]?.id ?? null;
        return mapTableNode(table, defaultViewId, index);
      }),
    };
  }

  @Post('base/:baseId/node')
  createBaseNode(
    @Param('baseId') baseId: string,
    @Body() body: { resourceType?: string; name?: string; icon?: string | null }
  ) {
    if (body.resourceType !== 'table') {
      return {
        id: `local_${body.resourceType ?? 'node'}`,
        parentId: null,
        resourceId: `local_${body.resourceType ?? 'node'}`,
        resourceType: body.resourceType ?? 'folder',
        order: 0,
        resourceMeta: {
          name: body.name ?? 'Untitled',
          icon: body.icon ?? null,
          createdByUser: localUser,
          createdTime: new Date().toISOString(),
          lastModifiedByUser: localUser,
          lastModifiedTime: null,
        },
        children: null,
      };
    }
    const table = this.mochiSqliteService.createTable({
      baseId,
      name: body.name ?? 'Untitled',
      icon: body.icon ?? null,
      primaryFieldName: 'Name',
    }) as LocalTable;
    const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
    return mapTableNode(table, views[0]?.id ?? null);
  }

  @Put('base/:baseId/node/:nodeId')
  updateBaseNode(
    @Param('nodeId') nodeId: string,
    @Body() body: { name?: string; icon?: string | null }
  ) {
    const table = this.mochiSqliteService.updateTable(nodeId, {
      ...(body.name ? { name: body.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'icon') ? { icon: body.icon ?? null } : {}),
    }) as LocalTable;
    const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
    return mapTableNode(table, views[0]?.id ?? null);
  }

  @Post('base/:baseId/node/:nodeId/duplicate')
  duplicateBaseNode(
    @Param('baseId') baseId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: DuplicateTableBody
  ) {
    const table = this.mochiSqliteService.duplicateTable(nodeId, {
      baseId,
      name: body.name,
      includeRecords: body.includeRecords,
    }) as LocalTable;
    const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
    return mapTableNode(table, views[0]?.id ?? null);
  }

  @Put('base/:baseId/node/:nodeId/move')
  moveBaseNode(
    @Param('nodeId') nodeId: string,
    @Body() body: { anchorId?: string; position?: 'before' | 'after' }
  ) {
    const anchor = body.anchorId
      ? (this.mochiSqliteService.getTable(body.anchorId) as LocalTable | undefined)
      : undefined;
    const anchorOrder = anchor?.sort_order ?? 0;
    const order = anchor
      ? body.position === 'after'
        ? anchorOrder + 0.5
        : body.position === 'before'
          ? anchorOrder - 0.5
          : anchorOrder
      : 0;
    const table = this.mochiSqliteService.updateTable(nodeId, { order }) as LocalTable;
    const views = this.mochiSqliteService.listViews(table.id) as LocalView[];
    return mapTableNode(table, views[0]?.id ?? null);
  }

  @Delete('base/:baseId/node/:nodeId')
  deleteBaseNode(@Param('nodeId') nodeId: string) {
    const table = this.mochiSqliteService.deleteTable(nodeId) as LocalTable | null;
    return {
      resourceId: table?.id ?? nodeId,
      resourceType: 'table',
      permanent: false,
    };
  }

  @Delete('base/:baseId/node/:nodeId/permanent')
  permanentDeleteBaseNode(@Param('nodeId') nodeId: string) {
    const table = this.mochiSqliteService.deleteTable(nodeId) as LocalTable | null;
    return {
      resourceId: table?.id ?? nodeId,
      resourceType: 'table',
      permanent: true,
    };
  }

  @Get('base/:baseId/share')
  listBaseShare() {
    return [];
  }

  @Get('template/by-base/:baseId')
  getTemplateByBaseId() {
    return null;
  }

  @Get('pin/list')
  getPinList() {
    return [];
  }

  @Get('admin/setting/public')
  getPublicSetting() {
    return localPublicSetting;
  }

  @Get(':baseId/ai/config')
  getAiConfig() {
    return {
      enable: false,
      llmProviders: [],
      capabilities: {
        disableActions: [],
        disableModelSelection: true,
      },
      gatewayModels: [],
      modelDefinationMap: {},
      attachmentTransferMode: null,
    };
  }

  @Get(':baseId/ai/disable-ai-actions')
  getAiDisableActions() {
    return {
      disableActions: [],
    };
  }

  @Get('base/:baseId/table/:tableId/activated-index')
  getTableActivatedIndex() {
    return [];
  }

  @Get('base/:baseId/table/:tableId/abnormal-index/:type')
  getTableAbnormalIndex() {
    return [];
  }

  @Get('comment/:tableId/count')
  getCommentCountsByQuery(
    @Query('skip') _skip?: string,
    @Query('take') _take?: string,
    @Query('filter') _filter?: string
  ) {
    return [];
  }

  @Get('comment/:tableId/:recordId/count')
  getRecordCommentCount(@Param('recordId') _recordId: string) {
    return {
      count: 0,
    };
  }

  @Post('user/last-visit')
  updateUserLastVisit(@Body() body: unknown) {
    return body ?? {};
  }

  @Get('user/last-visit')
  getUserLastVisit() {
    return undefined;
  }

  @Get('user/last-visit/map')
  getUserLastVisitMap() {
    return {};
  }

  @Get('user/last-visit/base-node')
  getUserLastVisitBaseNode() {
    return undefined;
  }

  @Get('user/last-visit/list-base')
  getUserLastVisitListBase() {
    return {};
  }
}
