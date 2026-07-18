import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IFieldVo, IRecord, IViewVo } from '@teable/core';
import { CellValueType, DbFieldType, FieldType, ViewType } from '@teable/core';
import { axios as teableAxios } from '@teable/openapi';
import type { ITableVo, IUserMeVo } from '@teable/openapi';
import {
  AnchorContext,
  AppContext,
  BaseProvider,
  ConnectionProvider,
  SessionContext,
  TableProvider,
} from '@teable/sdk/context';
import { defaultLocale } from '@teable/sdk/context/app/i18n';
import type { GetServerSideProps } from 'next';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import dynamic from 'next/dynamic';
import type { NextRouter } from 'next/router';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';
import { BaseNodeProvider } from '@/features/app/blocks/base/base-node/BaseNodeProvider';
import { BaseSideBar } from '@/features/app/blocks/base/base-side-bar/BaseSideBar';
import { Sidebar } from '@/features/app/components/sidebar/Sidebar';
import { tableConfig } from '@/features/i18n/table.config';
import { getLocalTableHref, rewriteLocalRouterUrl } from '@/features/mochi/local-router';
import { getServerSideTranslations } from '@/lib/i18n/getServerSideTranslations';
import { getLocalDataMutationScope, type LocalDataMutationScope } from './local-data-mutation';

const DynamicTable = dynamic(
  () => import('@/features/app/blocks/table/Table').then((mod) => mod.Table),
  {
    ssr: false,
  }
);

type LocalBase = {
  id: string;
  name: string;
};

type LocalTable = {
  id: string;
  base_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order?: number;
  last_modified_time?: string;
};

type LocalField = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  cell_value_type?: CellValueType | string;
  options?: unknown;
  meta?: unknown;
  aiConfig?: unknown;
  is_primary?: number | boolean;
  is_computed?: number | boolean;
  is_lookup?: number | boolean;
  not_null?: number | boolean;
  unique_value?: number | boolean;
  sort_order?: number;
};

type LocalView = {
  id: string;
  name: string;
  type?: string;
  description?: string | null;
  sort_order?: number;
  options?: unknown;
  columnMeta?: Record<string, unknown> | null;
  filter?: IViewVo['filter'];
  sort?: IViewVo['sort'];
  group?: IViewVo['group'];
  created_time?: string;
  last_modified_time?: string;
};

type LocalRecord = {
  id: string;
  table_id?: string;
  auto_number?: number;
  fields: Record<string, unknown>;
  created_time?: string;
  last_modified_time?: string;
};

const apiBase = process.env.NEXT_PUBLIC_MOCHI_API_BASE_URL ?? '';
const localUserId = 'usr_mochi_local';
const localSpaceId = 'spc_local';
const localDataMutatedEvent = 'mochi-local-data-mutated';
type LocalTableVo = ITableVo & { permission: Record<string, boolean> };

const localTablePermission = {
  'table|read': true,
  'table|create': true,
  'table|update': true,
  'table|delete': true,
  'table|export': true,
  'table|import': true,
};

const dispatchLocalDataMutated = (scope: LocalDataMutationScope) => {
  window.dispatchEvent(new CustomEvent(localDataMutatedEvent, { detail: { scope } }));
};

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (data) => {
      if (typeof window === 'undefined') {
        return;
      }
      const scope = getLocalDataMutationScope(data);
      if (!scope) {
        return;
      }
      dispatchLocalDataMutated(scope);
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

const toBool = (value: unknown) => value === true || value === 1;

const normalizeCellValueType = (cellValueType?: CellValueType | string): CellValueType => {
  if (Object.values(CellValueType).includes(cellValueType as CellValueType)) {
    return cellValueType as CellValueType;
  }
  return CellValueType.String;
};

const dbFieldTypeFor = (cellValueType?: CellValueType) => {
  switch (cellValueType) {
    case CellValueType.Number:
      return DbFieldType.Real;
    case CellValueType.Boolean:
      return DbFieldType.Boolean;
    case CellValueType.DateTime:
      return DbFieldType.DateTime;
    case CellValueType.String:
    default:
      return DbFieldType.Text;
  }
};

const defaultOptionsFor = (type: string) => {
  if (type === FieldType.SingleSelect || type === FieldType.MultipleSelect) return { choices: [] };
  if (type === FieldType.Number) return { formatting: { type: 'decimal', precision: 2 } };
  if (type === FieldType.Date) return { formatting: { date: 'YYYY-MM-DD', time: 'None' } };
  return {};
};

const mapField = (field: LocalField): IFieldVo => {
  const type = Object.values(FieldType).includes(field.type as FieldType)
    ? (field.type as FieldType)
    : FieldType.SingleLineText;
  const cellValueType = normalizeCellValueType(field.cell_value_type);

  return {
    id: field.id,
    name: field.name,
    type,
    description: field.description ?? undefined,
    options: (field.options ?? defaultOptionsFor(type)) as IFieldVo['options'],
    meta: (field.meta ?? undefined) as IFieldVo['meta'],
    aiConfig: (field.aiConfig ?? undefined) as IFieldVo['aiConfig'],
    isPrimary: toBool(field.is_primary),
    isComputed: toBool(field.is_computed),
    isLookup: toBool(field.is_lookup),
    notNull: toBool(field.not_null),
    unique: toBool(field.unique_value),
    cellValueType,
    isMultipleCellValue: type === FieldType.MultipleSelect || type === FieldType.Attachment,
    dbFieldType: dbFieldTypeFor(cellValueType),
    dbFieldName: field.id.replace(/\W/g, '_').slice(0, 63),
    recordRead: true,
    recordCreate: true,
  };
};

const normalizeColumnMeta = (
  columnMeta: LocalView['columnMeta'] | Array<{ fieldId?: string; columnMeta?: unknown }> | null,
  fields: IFieldVo[]
): IViewVo['columnMeta'] => {
  const defaultColumnMeta = fields.reduce<IViewVo['columnMeta']>((acc, field, index) => {
    acc[field.id] = { order: index, width: 200 };
    return acc;
  }, {});

  if (Array.isArray(columnMeta)) {
    return columnMeta.reduce<IViewVo['columnMeta']>((acc, item) => {
      if (item.fieldId) {
        acc[item.fieldId] = {
          ...(acc[item.fieldId] ?? {}),
          ...((item.columnMeta ?? {}) as IViewVo['columnMeta'][string]),
        };
      }
      return acc;
    }, defaultColumnMeta);
  }

  const savedColumnMeta = (columnMeta as IViewVo['columnMeta'] | null) ?? {};
  return fields.reduce<IViewVo['columnMeta']>((acc, field) => {
    acc[field.id] = {
      ...(acc[field.id] ?? {}),
      ...(savedColumnMeta[field.id] ?? {}),
    };
    return acc;
  }, defaultColumnMeta);
};

const normalizeSort = (sort: LocalView['sort']): IViewVo['sort'] => {
  if (!sort) return undefined;
  if (Array.isArray(sort)) return { sortObjs: sort } as IViewVo['sort'];
  const sortValue = sort as { sortObjs?: unknown };
  return Array.isArray(sortValue.sortObjs) ? (sort as IViewVo['sort']) : undefined;
};

const normalizeGroup = (group: LocalView['group']): IViewVo['group'] =>
  Array.isArray(group) ? (group as IViewVo['group']) : undefined;

const normalizeViewType = (type?: string): ViewType =>
  Object.values(ViewType).includes(type as ViewType) ? (type as ViewType) : ViewType.Grid;

const defaultViewOptionsFor = (
  type: ViewType,
  options: unknown,
  fields: IFieldVo[]
): IViewVo['options'] => {
  const currentOptions = (options ?? {}) as Record<string, unknown>;
  const primaryField = fields.find((field) => field.isPrimary) ?? fields[0];
  const firstDateField = fields.find(
    (field) => field.type === FieldType.Date || field.cellValueType === CellValueType.DateTime
  );
  const firstSingleSelectField = fields.find((field) => field.type === FieldType.SingleSelect);

  switch (type) {
    case ViewType.Kanban:
      return {
        stackFieldId: firstSingleSelectField?.id,
        isFieldNameHidden: false,
        isEmptyStackHidden: false,
        ...currentOptions,
      } as IViewVo['options'];
    case ViewType.Calendar:
      return {
        startDateFieldId: firstDateField?.id,
        endDateFieldId: firstDateField?.id,
        titleFieldId: primaryField?.id,
        ...currentOptions,
      } as IViewVo['options'];
    case ViewType.Form:
      return {
        submitLabel: 'Submit',
        ...currentOptions,
      } as IViewVo['options'];
    case ViewType.Gallery:
      return {
        titleFieldId: primaryField?.id,
        isCoverFit: true,
        ...currentOptions,
      } as IViewVo['options'];
    default:
      return currentOptions as IViewVo['options'];
  }
};

const mapView = (view: LocalView, fields: IFieldVo[]): IViewVo => {
  const columnMeta = normalizeColumnMeta(view.columnMeta, fields);
  const type = normalizeViewType(view.type);

  return {
    id: view.id,
    name: view.name,
    type,
    description: view.description ?? undefined,
    order: view.sort_order ?? 0,
    options: defaultViewOptionsFor(type, view.options, fields),
    sort: normalizeSort(view.sort),
    filter: view.filter,
    group: normalizeGroup(view.group),
    isLocked: false,
    createdBy: localUserId,
    createdTime: view.created_time ?? new Date(0).toISOString(),
    lastModifiedTime: view.last_modified_time ?? undefined,
    columnMeta,
  };
};

const mapTable = (table: LocalTable, defaultViewId?: string): LocalTableVo => ({
  id: table.id,
  name: table.name,
  dbTableName: table.id.replace(/\W/g, '_').slice(0, 63),
  description: table.description ?? undefined,
  icon: table.icon ?? undefined,
  order: table.sort_order ?? 0,
  lastModifiedTime: table.last_modified_time,
  defaultViewId,
  permission: localTablePermission,
});

const mapRecord = (record: LocalRecord, primaryFieldId?: string): IRecord => {
  const mappedRecord: IRecord & { tableId?: string } = {
    id: record.id,
    tableId: record.table_id,
    name: primaryFieldId ? String(record.fields[primaryFieldId] ?? '') : undefined,
    fields: record.fields ?? {},
    autoNumber: record.auto_number,
    createdTime: record.created_time,
    lastModifiedTime: record.last_modified_time,
    createdBy: 'Mochi Local',
    lastModifiedBy: 'Mochi Local',
  };
  return mappedRecord;
};

const localUser: IUserMeVo = {
  id: localUserId,
  name: 'Mochi Local',
  email: 'local@mochi.local',
  notifyMeta: {},
  hasPassword: false,
  isAdmin: true,
  lang: 'en',
};

type GridData = {
  baseId: string;
  tableId: string;
  viewId: string;
  tables: LocalTableVo[];
  fields: IFieldVo[];
  views: IViewVo[];
  records: IRecord[];
};

function MochiLocalGridPageInner() {
  const router = useRouter();
  const [data, setData] = useState<GridData>();
  const [status, setStatus] = useState('Loading Mochi SQLite table');
  const selectedTableId =
    typeof router.query.tableId === 'string' ? router.query.tableId : undefined;
  const selectedViewId = typeof router.query.viewId === 'string' ? router.query.viewId : undefined;

  const loadData = useCallback(async () => {
    setStatus('Loading Mochi SQLite table');
    const bases = await api<LocalBase[]>(`/api/mochi/bases?spaceId=${localSpaceId}`);
    let base = bases[0];
    if (!base) {
      base = await api<LocalBase>('/api/mochi/bases', {
        method: 'POST',
        body: JSON.stringify({ name: 'Local Base', spaceId: localSpaceId }),
      });
    }

    let tables = await api<LocalTable[]>(`/api/mochi/bases/${base.id}/tables`);
    let table = tables[0];
    if (!table) {
      table = await api<LocalTable>(`/api/mochi/bases/${base.id}/tables`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Customers', primaryFieldName: 'Name' }),
      });
      tables = [table];
    }
    table = tables.find((candidate) => candidate.id === selectedTableId) ?? table;

    const tableViewPairs = await Promise.all(
      tables.map(async (candidate) => [
        candidate.id,
        await api<LocalView[]>(`/api/mochi/tables/${candidate.id}/views`),
      ])
    );
    const viewsByTableId = new Map(tableViewPairs as Array<[string, LocalView[]]>);
    const localViews = viewsByTableId.get(table.id) ?? [];
    const selectedView = localViews.find((view) => view.id === selectedViewId) ?? localViews[0];

    const [localFields, localRecords] = await Promise.all([
      api<LocalField[]>(`/api/mochi/tables/${table.id}/fields`),
      api<LocalRecord[]>(`/api/mochi/tables/${table.id}/records?limit=1000`),
    ]);
    const fields = localFields.map(mapField);
    const primaryFieldId = fields.find((field) => field.isPrimary)?.id ?? fields[0]?.id;
    const views = localViews.map((view) => mapView(view, fields));
    const viewId = selectedView?.id;

    if (!viewId) {
      throw new Error('Mochi table has no grid view');
    }

    setData({
      baseId: base.id,
      tableId: table.id,
      viewId,
      tables: tables.map((candidate) => {
        const defaultViewId =
          viewsByTableId.get(candidate.id)?.[0]?.id ??
          (candidate.id === table.id ? viewId : undefined);
        return mapTable(candidate, defaultViewId);
      }),
      fields,
      views,
      records: localRecords.map((record) => mapRecord(record, primaryFieldId)),
    });
    setStatus('Ready');
  }, [selectedTableId, selectedViewId]);

  useEffect(() => {
    loadData().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, [loadData]);

  useEffect(() => {
    const refreshLocalData = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: LocalDataMutationScope }>).detail?.scope;
      if (scope === 'record' || scope === 'table') {
        return;
      }
      loadData().catch((error) =>
        setStatus(error instanceof Error ? error.message : String(error))
      );
    };

    window.addEventListener(localDataMutatedEvent, refreshLocalData);
    return () => window.removeEventListener(localDataMutatedEvent, refreshLocalData);
  }, [loadData]);

  useEffect(() => {
    const interceptor = teableAxios.interceptors.response.use((response) => {
      const scope = getLocalDataMutationScope(response);
      if (scope) {
        dispatchLocalDataMutated(scope);
      }
      return response;
    });

    return () => teableAxios.interceptors.response.eject(interceptor);
  }, []);

  if (!data) {
    return (
      <main className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {status}
      </main>
    );
  }

  const tableDataKey = data.tables
    .map((table) => `${table.id}:${table.name}:${table.lastModifiedTime ?? ''}`)
    .join('|');
  const fieldDataKey = data.fields
    .map((field) => `${field.id}:${field.name}:${field.type}:${field.isPrimary ? '1' : '0'}`)
    .join('|');
  const viewDataKey = data.views
    .map(
      (view) =>
        `${view.id}:${view.name}:${JSON.stringify(view.filter)}:${JSON.stringify(view.sort)}:${JSON.stringify(view.group)}:${JSON.stringify(view.columnMeta)}`
    )
    .join('|');
  const gridDataKey = data.records
    .map((record) => `${record.id}:${record.lastModifiedTime ?? record.createdTime ?? ''}`)
    .join('|');
  const tableRoute = `/base/${data.baseId}/table/${data.tableId}/${data.viewId}`;
  const localRouter = {
    ...router,
    route: '/base/[baseId]/[[...slug]]',
    pathname: '/base/[baseId]/[[...slug]]',
    asPath: tableRoute,
    query: {
      ...router.query,
      baseId: data.baseId,
      slug: ['table', data.tableId, data.viewId],
    },
    push: (url, as, options) =>
      router.push(
        rewriteLocalRouterUrl(url),
        as === undefined ? as : rewriteLocalRouterUrl(as),
        options
      ),
    replace: (url, as, options) =>
      router.replace(
        rewriteLocalRouterUrl(url),
        as === undefined ? as : rewriteLocalRouterUrl(as),
        options
      ),
  } as NextRouter;

  return (
    <RouterContext.Provider value={localRouter}>
      <SessionContext.Provider
        value={{ user: localUser, refresh: () => undefined, refreshAvatar: () => undefined }}
      >
        <ConnectionProvider>
          <AnchorContext.Provider
            value={{ baseId: data.baseId, tableId: data.tableId, viewId: data.viewId }}
          >
            <BaseProvider fallback={null}>
              <BaseNodeProvider>
                <TableProvider key={tableDataKey} serverData={data.tables}>
                  <main className="flex h-screen w-full overflow-hidden bg-background">
                    <Sidebar
                      headerLeft={
                        <div className="min-w-0 truncate px-2 text-sm font-medium">Mochi Local</div>
                      }
                    >
                      <div className="flex h-full flex-col gap-2 divide-y divide-solid overflow-auto py-2">
                        <BaseSideBar />
                      </div>
                    </Sidebar>
                    <section className="min-w-80 flex-1 overflow-hidden">
                      <DynamicTable
                        key={`${fieldDataKey}:${viewDataKey}:${gridDataKey}`}
                        fieldServerData={data.fields}
                        viewServerData={data.views}
                        recordsServerData={{ records: data.records }}
                      />
                    </section>
                  </main>
                </TableProvider>
              </BaseNodeProvider>
            </BaseProvider>
          </AnchorContext.Provider>
        </ConnectionProvider>
      </SessionContext.Provider>
    </RouterContext.Provider>
  );
}

export default function MochiLocalGridPage() {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== 'en') {
      void i18n.changeLanguage('en');
    }
  }, [i18n]);

  return (
    <AppContext.Provider value={{ locale: defaultLocale, lang: 'en' }}>
      <QueryClientProvider client={queryClient}>
        <MochiLocalGridPageInner />
      </QueryClientProvider>
    </AppContext.Provider>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {
      ...(await getServerSideTranslations('en', tableConfig.i18nNamespaces)),
    },
  };
};
