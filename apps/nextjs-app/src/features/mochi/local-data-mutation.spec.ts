import { describe, expect, it } from 'vitest';
import { getLocalDataMutationScope } from './local-data-mutation';

const responseFor = (method: string, url: string) => ({ config: { method, url } });

describe('getLocalDataMutationScope', () => {
  it.each([
    ['/api/table/tbl_1/record', 'post'],
    ['/api/table/tbl_1/record/rec_1', 'patch'],
    ['/api/table/tbl_1/record/rec_1/fld_attachment/insertAttachment', 'post'],
    ['/api/table/tbl_1/selection/paste', 'patch'],
    ['/api/table/tbl_1/selection/paste-by-id-stream', 'patch'],
    ['/api/table/tbl_1/selection/delete-by-id', 'post'],
    ['/api/table/tbl_1/selection/delete-by-id-stream', 'patch'],
    ['/api/table/tbl_1/selection/clear-by-id-stream', 'patch'],
  ])('classifies record mutation %s as record scope', (url, method) => {
    expect(getLocalDataMutationScope(responseFor(method, url))).toBe('record');
  });

  it.each([
    ['/api/base/bas_1/table/tbl_1/name', 'put'],
    ['/api/base/bas_1/table/tbl_1/icon', 'put'],
    ['/api/base/bas_1/table/tbl_1/description', 'put'],
  ])('classifies table metadata mutation %s as table scope', (url, method) => {
    expect(getLocalDataMutationScope(responseFor(method, url))).toBe('table');
  });

  it.each([
    ['/api/table/tbl_1/field', 'post'],
    ['/api/table/tbl_1/field/fld_1', 'patch'],
    ['/api/table/tbl_1/field/fld_1', 'delete'],
    ['/api/table/tbl_1/field?fieldIds=fld_1&fieldIds=fld_2', 'delete'],
    ['/api/table/tbl_1/field/fld_1/convert', 'put'],
    ['/api/table/tbl_1/field/fld_1/duplicate', 'post'],
    ['/api/table/tbl_1/view', 'post'],
    ['/api/table/tbl_1/view/viw_1/duplicate', 'post'],
    ['/api/table/tbl_1/view/viw_1', 'delete'],
    ['/api/table/tbl_1/undo-redo/undo', 'post'],
    ['/api/table/tbl_1/undo-redo/redo', 'post'],
    ['/api/table/tbl_1/undo-redo/undo-stream', 'post'],
    ['/api/table/tbl_1/undo-redo/redo-stream', 'post'],
  ])('classifies schema mutation %s as schema scope', (url, method) => {
    expect(getLocalDataMutationScope(responseFor(method, url))).toBe('schema');
  });

  it.each([
    '/api/table/tbl_1/view/viw_1/name',
    '/api/table/tbl_1/view/viw_1/filter',
    '/api/table/tbl_1/view/viw_1/sort',
    '/api/table/tbl_1/view/viw_1/group',
    '/api/table/tbl_1/view/viw_1/column-meta',
    '/api/table/tbl_1/view/viw_1/options',
  ])('does not emit browser mutation events for view header update %s', (url) => {
    expect(getLocalDataMutationScope(responseFor('put', url))).toBeNull();
  });

  it.each([
    ['/api/table/tbl_1/field/fld_1/plan', 'get'],
    ['/api/table/tbl_1/field/fld_1/plan', 'put'],
    ['/api/table/tbl_1/selection/copy-by-id', 'post'],
    ['/api/table/tbl_1/selection/temporaryPaste', 'patch'],
    ['/api/table/tbl_1/view/viw_1/filter', 'get'],
  ])('ignores non-local-grid mutation %s', (url, method) => {
    expect(getLocalDataMutationScope(responseFor(method, url))).toBeNull();
  });
});
