export type LocalDataMutationScope = 'record' | 'schema' | 'table';

export const getLocalDataMutationScope = (data: unknown): LocalDataMutationScope | null => {
  const response = data as {
    config?: { method?: string; url?: string };
  };
  const method = response.config?.method?.toLowerCase();
  const url = response.config?.url;
  if (!method || !url || !['post', 'patch', 'put', 'delete'].includes(method)) {
    return null;
  }
  const pathname = url.split('?')[0];
  if (pathname.endsWith('/plan')) {
    return null;
  }

  if (
    /\/table\/[^/]+\/record(?:\/[^/]+)?$/.test(pathname) ||
    /\/table\/[^/]+\/record\/[^/]+\/[^/]+\/insertAttachment$/.test(pathname) ||
    /\/table\/[^/]+\/selection\/(?:paste|paste-by-id|paste-by-id-stream|clear|clear-by-id|clear-by-id-stream|delete|delete-by-id|delete-by-id-stream)$/.test(
      pathname
    )
  ) {
    return 'record';
  }

  if (
    /\/table\/[^/]+\/(?:name|icon|description)$/.test(pathname) ||
    /\/base\/[^/]+\/node\/[^/]+(?:\/move)?$/.test(pathname)
  ) {
    return 'table';
  }

  if (/\/table\/[^/]+\/undo-redo\/(?:undo|redo)(?:-stream)?$/.test(pathname)) {
    return 'schema';
  }

  if (
    /\/table\/[^/]+\/field(?:\/[^/]+)?(?:\/(?:convert|duplicate))?$/.test(pathname) ||
    /\/table\/[^/]+\/view(?:\/[^/]+)?(?:\/duplicate)?$/.test(pathname)
  ) {
    return 'schema';
  }

  return null;
};
