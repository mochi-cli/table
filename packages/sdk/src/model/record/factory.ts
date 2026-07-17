import { IdPrefix, type IRecord } from '@teable/core';
import { plainToInstance } from 'class-transformer';
import type { Doc } from 'sharedb/lib/client';
import type { IFieldInstance } from '../field';
import { Record } from './record';

type LocalRecord = IRecord & {
  tableId?: string;
};

const createLocalRecordDoc = (record: LocalRecord): Doc<IRecord> | undefined => {
  if (!record.tableId) {
    return undefined;
  }

  return {
    id: record.id,
    collection: `${IdPrefix.Record}_${record.tableId}`,
    data: record,
    emit: () => undefined,
  } as unknown as Doc<IRecord>;
};

export function createRecordInstance(record: IRecord, doc?: Doc<IRecord>) {
  const instance = plainToInstance(Record, record);
  // force inject object into instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temp: any = instance;
  temp.doc = doc ?? createLocalRecordDoc(record as LocalRecord);
  return instance;
}

export function recordInstanceFieldMap(
  instance: Record,
  fieldMap: { [fieldId: string]: IFieldInstance }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const temp: any = instance;
  temp.fieldMap = fieldMap;
  return instance;
}
