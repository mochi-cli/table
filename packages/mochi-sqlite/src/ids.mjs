import { randomUUID } from 'node:crypto';

export const createId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 18)}`;

export const ids = {
  space: () => createId('spc'),
  base: () => createId('bas'),
  table: () => createId('tbl'),
  field: () => createId('fld'),
  view: () => createId('viw'),
  record: () => createId('rec'),
  comment: () => createId('com'),
  attachment: () => createId('att'),
  attachmentRef: () => createId('arf'),
  trash: () => createId('trh'),
  recordHistory: () => createId('rhi'),
  importSource: () => createId('ims'),
  computedJob: () => createId('job'),
  opBatch: () => createId('opb'),
  op: () => createId('op'),
};
