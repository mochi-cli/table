import { describe, expect, it } from 'vitest';
import { rewriteLocalRouterUrl } from '@/features/mochi/local-router';

describe('rewriteLocalRouterUrl', () => {
  it('preserves record query params when rewriting Teable table route objects', () => {
    expect(
      rewriteLocalRouterUrl({
        pathname: '/base/[baseId]/[[...slug]]',
        query: {
          baseId: 'bas_1',
          slug: ['table', 'tbl_1', 'viw_1'],
          recordId: 'rec_1',
          showHistory: 'true',
        },
      })
    ).toBe('/mochi/local?tableId=tbl_1&viewId=viw_1&recordId=rec_1&showHistory=true');
  });

  it('preserves string route query params when rewriting table paths', () => {
    expect(rewriteLocalRouterUrl('/base/bas_1/table/tbl_1/viw_1?recordId=rec_1')).toBe(
      '/mochi/local?tableId=tbl_1&viewId=viw_1&recordId=rec_1'
    );
  });

  it('does not leak route-only query params into Mochi local URLs', () => {
    expect(
      rewriteLocalRouterUrl({
        pathname: '/base/[baseId]/[[...slug]]',
        query: {
          baseId: 'bas_1',
          slug: ['table', 'tbl_1', 'viw_1'],
          tableId: 'tbl_old',
          viewId: 'viw_old',
          showComment: 'true',
        },
      })
    ).toBe('/mochi/local?tableId=tbl_1&viewId=viw_1&showComment=true');
  });
});
