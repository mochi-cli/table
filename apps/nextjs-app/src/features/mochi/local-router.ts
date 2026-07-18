import type { NextRouter } from 'next/router';

type RouterUrl = Parameters<NextRouter['push']>[0];

const localTablePathPattern = /^\/base\/[^/]+\/table\/([^/?#]+)(?:\/([^/?#]+))?/;

const appendQueryParam = (params: URLSearchParams, key: string, value: unknown) => {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryParam(params, key, item));
    return;
  }
  params.append(key, String(value));
};

export const getLocalTableHref = (
  tableId: string,
  viewId?: string,
  extraQuery?: Record<string, unknown>
) => {
  const params = new URLSearchParams({ tableId });
  if (viewId) {
    params.set('viewId', viewId);
  }
  Object.entries(extraQuery ?? {}).forEach(([key, value]) => appendQueryParam(params, key, value));
  return `/mochi/local?${params.toString()}`;
};

const localQueryFromUrlSearch = (searchParams: URLSearchParams) => {
  const query: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) {
      query[key] = value;
      return;
    }
    query[key] = Array.isArray(current) ? [...current, value] : [current, value];
  });
  return query;
};

const omitRouteQuery = (query?: Record<string, unknown>) => {
  const { baseId: _baseId, slug: _slug, tableId: _tableId, viewId: _viewId, ...rest } = query ?? {};
  return rest;
};

export const rewriteLocalRouterUrl = (url: RouterUrl): RouterUrl => {
  if (typeof url === 'string') {
    const parsed = new URL(url, 'http://mochi.local');
    const match = parsed.pathname.match(localTablePathPattern);
    return match
      ? getLocalTableHref(match[1], match[2], localQueryFromUrlSearch(parsed.searchParams))
      : url;
  }

  const query = typeof url.query === 'object' && url.query !== null ? url.query : undefined;
  const slug = query?.slug;
  if (Array.isArray(slug) && slug[0] === 'table' && typeof slug[1] === 'string') {
    return getLocalTableHref(slug[1], typeof slug[2] === 'string' ? slug[2] : undefined, {
      ...omitRouteQuery(query),
    });
  }

  const pathname = url.pathname;
  if (typeof pathname === 'string') {
    const match = pathname.match(localTablePathPattern);
    if (match) {
      return getLocalTableHref(match[1], match[2], omitRouteQuery(query));
    }
  }

  return url;
};
