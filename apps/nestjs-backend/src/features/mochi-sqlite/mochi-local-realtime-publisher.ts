type ActionTriggerData = {
  actionKey: 'addRecord' | 'setRecord' | 'deleteRecord';
  payload?: Record<string, unknown>;
};

type ActionTriggerPublisher = (tableId: string, data: ActionTriggerData[]) => void;

let publisher: ActionTriggerPublisher | undefined;

export const setMochiLocalActionTriggerPublisher = (nextPublisher: ActionTriggerPublisher) => {
  publisher = nextPublisher;
};

export const clearMochiLocalActionTriggerPublisher = (nextPublisher: ActionTriggerPublisher) => {
  if (publisher === nextPublisher) {
    publisher = undefined;
  }
};

export const publishMochiLocalActionTrigger = (
  tableId: string,
  data: ActionTriggerData[]
): boolean => {
  if (!publisher) {
    return false;
  }
  publisher(tableId, data);
  return true;
};
