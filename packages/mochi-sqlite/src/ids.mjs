import { randomUUID } from 'node:crypto';

export const createId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 18)}`;

export const ids = {
  space: () => createId('spc'),
  base: () => createId('bas'),
  table: () => createId('tbl'),
  field: () => createId('fld'),
  view: () => createId('viw'),
  record: () => createId('rec'),
  opBatch: () => createId('opb'),
  op: () => createId('op'),
};
