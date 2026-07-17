import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ITableActionKey } from '@teable/core';
import { Events } from '../../event-emitter/events/event.enum';
import { MochiLocalShareDbService } from './mochi-local-sharedb.service';

const getLocalActionTriggerChannel = (tableIdOrViewId: string) =>
  `__action_trigger_${tableIdOrViewId}`;

type ChangedRecord = {
  id?: string;
  fields?: Record<string, unknown>;
};

type MochiRecordEvent = {
  name: Events;
  payload: {
    tableId: string;
    record?: ChangedRecord | ChangedRecord[];
    recordId?: string | string[];
  };
  context?: {
    entry?: {
      type?: string;
    };
  };
};

type ActionTriggerData = {
  actionKey: ITableActionKey;
  payload?: Record<string, unknown>;
};

const collectChangedRecordFieldIds = (record?: ChangedRecord | ChangedRecord[]): string[] => {
  const records = Array.isArray(record) ? record : record ? [record] : [];
  const fieldIds = new Set<string>();
  for (const changeRecord of records) {
    for (const fieldId of Object.keys(changeRecord.fields ?? {})) {
      fieldIds.add(fieldId);
    }
  }
  return [...fieldIds];
};

@Injectable()
export class MochiLocalActionTriggerListener {
  private readonly logger = new Logger(MochiLocalActionTriggerListener.name);

  constructor(private readonly shareDbService: MochiLocalShareDbService) {}

  @OnEvent('table.record.*', { async: true })
  private async listener(event: MochiRecordEvent): Promise<void> {
    if (event.context?.entry?.type !== 'mochi-sqlite') {
      return;
    }

    const { tableId } = event.payload;
    const actionTriggerData = this.toActionTriggerData(event);
    if (!actionTriggerData.length) {
      return;
    }

    const presence = this.shareDbService.connect().getPresence(getLocalActionTriggerChannel(tableId));
    const localPresence = presence.create(tableId);
    localPresence.submit(actionTriggerData, (error) => {
      if (error) {
        this.logger.error(error);
      }
    });
  }

  private toActionTriggerData(event: MochiRecordEvent): ActionTriggerData[] {
    const { tableId } = event.payload;

    if (event.name === Events.TABLE_RECORD_CREATE) {
      return [{ actionKey: 'addRecord', payload: { tableId, skipRealtime: true } }];
    }

    if (event.name === Events.TABLE_RECORD_UPDATE) {
      return [
        {
          actionKey: 'setRecord',
          payload: {
            tableId,
            fieldIds: collectChangedRecordFieldIds(event.payload.record),
            skipRealtime: true,
          },
        },
      ];
    }

    if (event.name === Events.TABLE_RECORD_DELETE) {
      const recordId = event.payload.recordId;
      return [
        {
          actionKey: 'deleteRecord',
          payload: {
            tableId,
            recordIds: Array.isArray(recordId) ? recordId : recordId ? [recordId] : [],
            skipRealtime: true,
          },
        },
      ];
    }

    return [];
  }
}
