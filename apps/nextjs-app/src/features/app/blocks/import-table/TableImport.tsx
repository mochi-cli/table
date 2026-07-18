import { useMutation } from '@tanstack/react-query';
import type { ITimeZoneString } from '@teable/core';
import type {
  IInplaceImportOptionRo,
  IImportOptionRo,
  IAnalyzeRo,
  IImportSheetItem,
  SUPPORTEDTYPE,
  IAnalyzeVo,
  IImportOption,
  INotifyVo,
} from '@teable/openapi';
import {
  importTypeMap,
  analyzeFile,
  importTableFromFile,
  inplaceImportTableFromFile,
  BaseNodeResourceType,
} from '@teable/openapi';
import { useBase, LocalStorageKeys } from '@teable/sdk';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Spin,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Checkbox,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import type { NextRouter } from 'next/router';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState, useRef, useCallback } from 'react';
import { useLocalStorage } from 'react-use';
import { usePublicSettingQuery } from '../../hooks/useSetting';
import { getNodeUrl } from '../base/base-node/hooks';
import { FieldConfigPanel, InplaceFieldConfigPanel } from './field-config-panel';
import { UploadPanel } from './upload-panel';
import { UrlPanel } from './UrlPanel';

interface ITableImportProps {
  open?: boolean;
  tableId?: string;
  children?: React.ReactElement;
  fileType: SUPPORTEDTYPE;
  onOpenChange?: (open: boolean) => void;
}

export type ITableImportOptions = IImportOption & {
  autoSelectType: boolean;
};

enum Step {
  UPLOAD = 'upload',
  CONFIG = 'config',
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

type LocalImportResult = {
  importedTables?: Array<{
    table?: {
      id?: string;
      defaultViewId?: string;
    };
  }>;
};

const importLocalFile = async (input: { file: File; fileType: SUPPORTEDTYPE; baseId: string }) => {
  const contentBase64 = await fileToBase64(input.file);
  const response = await fetch('/api/mochi/imports/file', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: input.file.name,
      fileType: input.fileType,
      contentBase64,
      baseId: input.baseId,
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<LocalImportResult>;
};

const useLocalFileImport = (input: {
  baseId: string;
  fileType: SUPPORTEDTYPE;
  router: NextRouter;
  onOpenChange?: (open: boolean) => void;
  errorMessage: string;
}) =>
  useMutation({
    mutationFn: (file: File) =>
      importLocalFile({ file, fileType: input.fileType, baseId: input.baseId }),
    onSuccess: (data) => {
      const table = data.importedTables?.[0]?.table;
      input.onOpenChange?.(false);
      if (table?.id) {
        input.router.push(`/mochi/local?tableId=${table.id}&viewId=${table.defaultViewId ?? ''}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : input.errorMessage);
    },
  });

const useImportFileChangeHandler = (input: {
  fileType: SUPPORTEDTYPE;
  isMochiLocal: boolean;
  tableId?: string;
  setFile: (file: File | null) => void;
  importLocalFile: (file: File) => void;
  formatError: string;
  exceedSizeMessage: (size: number) => string;
}) =>
  useCallback(
    (file: File | null) => {
      const { exceedSize, accept } = importTypeMap[input.fileType];
      const acceptGroup = accept.split(',');

      if (file && !acceptGroup.includes(file.type)) {
        toast.error(input.formatError);
        return;
      }

      if (exceedSize && file && file.size > exceedSize * 1024 * 1024) {
        toast.error(input.exceedSizeMessage(exceedSize));
        return;
      }

      input.setFile(file);
      if (file && input.isMochiLocal && !input.tableId) {
        void input.importLocalFile(file);
      }
    },
    [input]
  );

// eslint-disable-next-line sonarjs/cognitive-complexity
export const TableImport = (props: ITableImportProps) => {
  const base = useBase();
  const router = useRouter();
  const { t } = useTranslation(['table']);
  const { data: publicSetting } = usePublicSettingQuery();
  const [step, setStep] = useState(Step.UPLOAD);
  const { children, open, onOpenChange, fileType, tableId } = props;
  const [errorMessage, setErrorMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<IAnalyzeRo>({} as IAnalyzeRo);
  const primitiveWorkSheets = useRef<IAnalyzeVo['worksheets']>({});
  const [workSheets, setWorkSheets] = useState<IImportOptionRo['worksheets']>({});
  const [insertConfig, setInsertConfig] = useState<IInplaceImportOptionRo['insertConfig']>({
    excludeFirstRow: true,
    sourceWorkSheetKey: '',
    sourceColumnMap: {},
  });
  const [shouldAlert, setShouldAlert] = useLocalStorage(LocalStorageKeys.ImportAlert, true);
  const [shouldTips, setShouldTips] = useState(false);
  const isMochiLocal = publicSetting?.instanceId === 'mochi-local';

  const { mutateAsync: importLocalFileFn, isPending: localImportLoading } = useLocalFileImport({
    baseId: base.id,
    fileType,
    router,
    onOpenChange,
    errorMessage: t('table:import.form.error.errorFileFormat'),
  });

  const { mutateAsync: importNewTableFn, isPending: isLoading } = useMutation({
    mutationFn: async ({ baseId, importRo }: { baseId: string; importRo: IImportOptionRo }) => {
      return (await importTableFromFile(baseId, importRo)).data;
    },
    onSuccess: (data) => {
      const { defaultViewId: viewId, id: tableId } = data[0];
      onOpenChange?.(false);
      const url = getNodeUrl({
        baseId: base.id,
        resourceType: BaseNodeResourceType.Table,
        resourceId: tableId,
        viewId,
      });
      if (url) {
        router.push(url, undefined, { shallow: true });
      }
    },
  });

  const { mutateAsync: inplaceImportFn, isPending: inplaceLoading } = useMutation({
    mutationFn: (args: Parameters<typeof inplaceImportTableFromFile>) => {
      return inplaceImportTableFromFile(...args);
    },
    onSuccess: () => {
      onOpenChange?.(false);
      const { tableId: routerTableId } = router.query;
      routerTableId !== tableId && router.push(`/base/${base.id}/table/${tableId}`);
    },
  });

  const importTable = async () => {
    const importNewTable = () => {
      for (const [, value] of Object.entries(workSheets)) {
        const { columns } = value;

        if (columns.some((col) => !col.name)) {
          setErrorMessage(t('table:import.form.error.fieldNameEmpty'));
          return;
        }
        if (new Set(columns.map((col) => col.name.trim())).size !== columns.length) {
          setErrorMessage(t('table:import.form.error.uniqueFieldName'));
          return;
        }
      }

      importNewTableFn({
        baseId: base.id,
        importRo: {
          worksheets: workSheets,
          ...fileInfo,
          notification: true,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone as ITimeZoneString,
        },
      });
    };

    const inplaceImportTable = () => {
      const { sourceColumnMap } = insertConfig;
      if (Object.values(sourceColumnMap).every((col) => col === null)) {
        setErrorMessage(t('table:import.form.error.atLeastAImportField'));
        return;
      }
      const preInsertConfig = {
        ...insertConfig,
        sourceColumnMap: Object.fromEntries(
          Object.entries(sourceColumnMap).filter(([, value]) => value !== null)
        ),
      };
      inplaceImportFn([
        base.id,
        tableId as string,
        {
          ...fileInfo,
          insertConfig: preInsertConfig,
          notification: true,
        },
      ]);
    };

    tableId ? inplaceImportTable() : importNewTable();
  };

  const { mutateAsync: analyzeByUrl, isPending: analyzeLoading } = useMutation({
    mutationFn: analyzeFile,
    onSuccess: (data, params) => {
      const { attachmentUrl, fileType } = params;
      setFileInfo({
        attachmentUrl,
        fileType,
      });
      const {
        data: { worksheets },
      } = data;

      const workSheetsWithIndex: IImportOptionRo['worksheets'] = {};
      for (const [key, value] of Object.entries(worksheets)) {
        const item = { ...value, importData: true, useFirstRowAsHeader: true } as IImportSheetItem;
        item.columns = item.columns.map((col, index) => ({
          ...col,
          sourceColumnIndex: index,
        }));

        workSheetsWithIndex[key] = item;
      }
      setInsertConfig({ ...insertConfig, ['sourceWorkSheetKey']: Object.keys(worksheets)[0] });
      setWorkSheets(workSheetsWithIndex);
      primitiveWorkSheets.current = worksheets;
      setStep(Step.CONFIG);
    },
  });

  const fileFinishedHandler = useCallback(
    async (result: INotifyVo) => {
      const { presignedUrl } = result;

      await analyzeByUrl({
        attachmentUrl: presignedUrl,
        fileType,
      });
    },
    [analyzeByUrl, fileType]
  );

  const fileCloseHandler = useCallback(() => {
    setFile(null);
  }, []);

  const fileChangeHandler = useImportFileChangeHandler({
    fileType,
    isMochiLocal,
    tableId,
    setFile,
    importLocalFile: (file) => {
      void importLocalFileFn(file);
    },
    formatError: t('table:import.form.error.errorFileFormat'),
    exceedSizeMessage: (size) => `${t('table:import.tips.fileExceedSizeTip')} ${size}MB`,
  });

  const fieldChangeHandler = (value: IImportOptionRo['worksheets']) => {
    setWorkSheets(value);
  };

  const inplaceFieldChangeHandler = (value: IInplaceImportOptionRo['insertConfig']) => {
    setInsertConfig(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => onOpenChange?.(open)}>
        {children && <DialogTrigger>{children}</DialogTrigger>}
        {open && (
          <DialogContent
            className="z-50 flex max-h-[80%] max-w-[800px] flex-col overflow-hidden"
            overlayStyle={{
              pointerEvents: 'none',
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          >
            <Tabs defaultValue="localFile" className="flex-1 overflow-auto">
              {step === Step.UPLOAD && (
                <TabsList>
                  <TabsTrigger value="localFile">{t('table:import.title.localFile')}</TabsTrigger>
                  <TabsTrigger value="url">{t('table:import.title.linkUrl')}</TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="localFile">
                {step === Step.UPLOAD && (
                  <UploadPanel
                    fileType={fileType}
                    file={file}
                    onChange={fileChangeHandler}
                    onClose={fileCloseHandler}
                    analyzeLoading={isMochiLocal ? localImportLoading : analyzeLoading}
                    localMode={isMochiLocal}
                    onFinished={fileFinishedHandler}
                  />
                )}
                {step === Step.CONFIG &&
                  (tableId ? (
                    <InplaceFieldConfigPanel
                      tableId={tableId}
                      workSheets={workSheets}
                      insertConfig={insertConfig}
                      errorMessage={errorMessage}
                      onChange={inplaceFieldChangeHandler}
                    ></InplaceFieldConfigPanel>
                  ) : (
                    <FieldConfigPanel
                      tableId={tableId}
                      workSheets={workSheets}
                      errorMessage={errorMessage}
                      onChange={fieldChangeHandler}
                    ></FieldConfigPanel>
                  ))}
              </TabsContent>
              <TabsContent value="url">
                {step === Step.UPLOAD && (
                  <UrlPanel
                    analyzeFn={analyzeByUrl}
                    isFinished={analyzeLoading}
                    fileType={fileType}
                  ></UrlPanel>
                )}
                {step === Step.CONFIG &&
                  (tableId ? (
                    <InplaceFieldConfigPanel
                      tableId={tableId}
                      workSheets={workSheets}
                      insertConfig={insertConfig}
                      errorMessage={errorMessage}
                      onChange={inplaceFieldChangeHandler}
                    ></InplaceFieldConfigPanel>
                  ) : (
                    <FieldConfigPanel
                      tableId={tableId}
                      workSheets={workSheets}
                      errorMessage={errorMessage}
                      onChange={fieldChangeHandler}
                    ></FieldConfigPanel>
                  ))}
              </TabsContent>
            </Tabs>
            {step === Step.CONFIG && (
              <DialogFooter>
                <footer className="mt-1 flex items-center justify-end">
                  <Button size="sm" variant="secondary" onClick={() => onOpenChange?.(false)}>
                    {t('table:import.menu.cancel')}
                  </Button>
                  <AlertDialog>
                    {shouldAlert ? (
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          className="ml-1"
                          disabled={tableId ? inplaceLoading : isLoading}
                        >
                          {(tableId ? inplaceLoading : isLoading) && (
                            <Spin className="mr-1 size-4" />
                          )}
                          {t('table:import.title.import')}
                        </Button>
                      </AlertDialogTrigger>
                    ) : (
                      <Button
                        size="sm"
                        className="ml-1"
                        onClick={() => importTable()}
                        disabled={tableId ? inplaceLoading : isLoading}
                      >
                        {(tableId ? inplaceLoading : isLoading) && <Spin className="mr-1 size-4" />}
                        {t('table:import.title.import')}
                      </Button>
                    )}
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('table:import.title.tipsTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('table:import.tips.importAlert')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="flex items-center">
                        <Checkbox
                          id="noTips"
                          checked={shouldTips}
                          onCheckedChange={(res: boolean) => {
                            setShouldTips(res);
                          }}
                        />
                        <label
                          htmlFor="noTips"
                          className="pl-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {t('table:import.tips.noTips')}
                        </label>
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('table:import.menu.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            importTable();
                            if (shouldTips) {
                              setShouldAlert(false);
                            }
                          }}
                        >
                          {t('table:import.title.confirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </footer>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
};
