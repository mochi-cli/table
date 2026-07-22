import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBaseNodeChannel } from '@teable/core';
import type { IBaseNodeTreeVo, IBaseNodeVo } from '@teable/openapi';
import { getBaseNodeTree } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useConnection } from '@teable/sdk/hooks';
import { isEmpty, get } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTreeItems, filterRestrictedBaseNodes } from './helper';

export type TreeItemData = Omit<IBaseNodeVo, 'children'> & { children: string[] };
const localDataMutatedEvent = 'mochi-local-data-mutated';

export const useBaseNode = (baseId: string, isRestrictedAuthority?: boolean) => {
  const { connection } = useConnection();
  const channel = getBaseNodeChannel(baseId);
  const presence = connection?.getPresence(channel);
  const [nodes, setNodes] = useState<IBaseNodeVo[]>([]);
  const [preservedEmptyFolderIds, setPreservedEmptyFolderIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const queryClient = useQueryClient();

  // Initialize treeItems from cache to avoid flash of empty state on remount
  const [treeItems, setTreeItems] = useState<Record<string, TreeItemData>>(() => {
    const cachedData = queryClient.getQueryData<IBaseNodeTreeVo>(
      ReactQueryKeys.baseNodeTree(baseId)
    );
    if (cachedData?.nodes && cachedData.nodes.length > 0) {
      return buildTreeItems(cachedData.nodes);
    }
    return {};
  });

  const { data: queryData, isLoading } = useQuery({
    queryKey: ReactQueryKeys.baseNodeTree(baseId),
    queryFn: ({ queryKey }) => getBaseNodeTree(queryKey[1]).then((res) => res.data),
    enabled: Boolean(baseId),
  });

  const invalidateMenu = useCallback(() => {
    if (baseId) {
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.baseNodeTree(baseId) });
    }
  }, [baseId, queryClient]);

  const preserveCreatedFolder = useCallback((folderId: string) => {
    setPreservedEmptyFolderIds((prev) => {
      if (prev.has(folderId)) {
        return prev;
      }
      return new Set(prev).add(folderId);
    });
  }, []);

  const maxFolderDepth = useMemo(() => {
    return queryData?.maxFolderDepth ?? 2;
  }, [queryData?.maxFolderDepth]);

  useEffect(() => {
    if (queryData?.nodes) {
      setNodes(queryData?.nodes);
    }
  }, [queryData?.nodes, setNodes]);

  useEffect(() => {
    if (nodes.length > 0) {
      setTreeItems(
        buildTreeItems(
          isRestrictedAuthority ? filterRestrictedBaseNodes(nodes, preservedEmptyFolderIds) : nodes
        )
      );
    } else {
      setTreeItems({});
    }
  }, [nodes, setTreeItems, isRestrictedAuthority, preservedEmptyFolderIds]);

  useEffect(() => {
    if (!presence || !channel) {
      return;
    }

    if (presence.subscribed) {
      return;
    }

    presence.subscribe();

    const receiveHandler = () => {
      const { remotePresences } = presence;
      if (!isEmpty(remotePresences)) {
        const remotePayload = get(remotePresences, channel);
        if (remotePayload) {
          invalidateMenu();
        }
      }
    };

    presence.on('receive', receiveHandler);

    return () => {
      presence?.removeListener('receive', receiveHandler);
      presence?.listenerCount('receive') === 0 && presence?.unsubscribe();
      presence?.listenerCount('receive') === 0 && presence?.destroy();
    };
  }, [connection, presence, channel, setNodes, invalidateMenu]);

  useEffect(() => {
    const refreshLocalTableNode = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (scope === 'table') {
        invalidateMenu();
      }
    };
    window.addEventListener(localDataMutatedEvent, refreshLocalTableNode);
    return () => window.removeEventListener(localDataMutatedEvent, refreshLocalTableNode);
  }, [invalidateMenu]);

  return useMemo(() => {
    return {
      isLoading,
      maxFolderDepth,
      treeItems,
      setTreeItems,
      preserveCreatedFolder,
      invalidateMenu,
    };
  }, [isLoading, maxFolderDepth, treeItems, setTreeItems, preserveCreatedFolder, invalidateMenu]);
};
