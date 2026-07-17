import { useQuery } from '@tanstack/react-query';
import { getUserLastVisitMap, LastVisitResourceType } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useBaseId, useTables } from '@teable/sdk/hooks';
import { useIsReadOnlyPreview } from '@teable/sdk/hooks/use-is-readonly-preview';
import { useMemo } from 'react';
import { useShareUrlPrefix } from '../../context/ShareContext';

export const useTableHref = (): {
  hrefMap: Record<string, string>;
  viewIdMap: Record<string, string>;
} => {
  const baseId = useBaseId();
  const tables = useTables();
  const isReadOnlyPreview = useIsReadOnlyPreview();
  const shareUrlPrefix = useShareUrlPrefix();
  const isMochiLocal = typeof window !== 'undefined' && window.location.pathname === '/mochi/local';
  const { data: userLastVisitMap } = useQuery({
    queryKey: ReactQueryKeys.userLastVisitMap(baseId as string),
    queryFn: ({ queryKey }) =>
      getUserLastVisitMap({
        resourceType: LastVisitResourceType.Table,
        parentResourceId: queryKey[1],
      }).then((res) => res.data),
    enabled: !isReadOnlyPreview && !shareUrlPrefix,
  });

  return useMemo(() => {
    const hrefMap: Record<string, string> = {};
    const viewIdMap: Record<string, string> = {};
    tables.forEach((table) => {
      const viewId = userLastVisitMap?.[table.id]?.resourceId || table.defaultViewId;
      viewIdMap[table.id] = viewId;
      if (isMochiLocal) {
        const params = new URLSearchParams({ tableId: table.id });
        if (viewId) {
          params.set('viewId', viewId);
        }
        hrefMap[table.id] = `/mochi/local?${params.toString()}`;
        return;
      }
      // Add share URL prefix if present
      hrefMap[table.id] = `${shareUrlPrefix}/base/${baseId}/table/${table.id}/${viewId}`;
    });
    return { hrefMap, viewIdMap };
  }, [baseId, tables, userLastVisitMap, shareUrlPrefix, isMochiLocal]);
};
