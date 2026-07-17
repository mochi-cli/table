import { useTablePermission, usePersonalView, useView } from '@teable/sdk/hooks';
import { ConfirmDialog } from '@teable/ui-lib/base';
import {
  Switch,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@teable/ui-lib/shadcn';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Fragment, useState } from 'react';
import { tableConfig } from '@/features/i18n/table.config';

interface IPersonalViewSwitchProps {
  textClassName?: string;
  buttonClassName?: string;
}

export const PersonalViewSwitch = (props: IPersonalViewSwitchProps) => {
  const { textClassName, buttonClassName } = props;
  const router = useRouter();
  const view = useView();
  const permission = useTablePermission();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const isMochiLocal = router.pathname === '/mochi/local';
  const personalText = isMochiLocal ? 'Personal' : t('table:toolbar.others.personalView.personal');
  const tipText = isMochiLocal
    ? 'After enabling, the view settings will only take effect for you personally'
    : t('table:toolbar.others.personalView.tip');
  const dialogTitle = isMochiLocal
    ? 'Exit personal mode'
    : t('table:toolbar.others.personalView.dialog.title');
  const dialogDescription = isMochiLocal
    ? 'The personal view configuration will be restored to the real-time collaboration state'
    : t('table:toolbar.others.personalView.dialog.description');
  const dialogCancelText = isMochiLocal
    ? 'Exit and sync'
    : t('table:toolbar.others.personalView.dialog.cancelText');
  const dialogConfirmText = isMochiLocal
    ? 'Confirm exit'
    : t('table:toolbar.others.personalView.dialog.confirmText');
  const { isPersonalView, openPersonalView, closePersonalView, syncViewProperties } =
    usePersonalView();
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const hasSyncPermission = permission['view|update'];
  const onSwitchChange = (checked: boolean) => {
    if (checked) {
      openPersonalView?.();
      return;
    }

    // turning off personal view
    if (!hasSyncPermission || view?.isLocked) {
      closePersonalView?.();
    } else {
      setIsConfirmOpen(true);
    }
  };

  return (
    <Fragment>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`${buttonClassName ?? ''} flex h-7 cursor-pointer items-center gap-2 whitespace-nowrap pl-1 text-xs`}
            >
              <span>{personalText}</span>
              <Switch
                id="personal-view-switch"
                checked={Boolean(isPersonalView)}
                onCheckedChange={onSwitchChange}
              />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>
              {<span>{tipText}</span>}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <ConfirmDialog
        open={Boolean(isConfirmOpen)}
        closeable={true}
        onOpenChange={(val) => {
          if (!val) {
            setIsConfirmOpen(false);
          }
        }}
        title={dialogTitle}
        description={dialogDescription}
        cancelText={dialogCancelText}
        confirmText={dialogConfirmText}
        onConfirm={() => {
          closePersonalView?.();
          setIsConfirmOpen(false);
        }}
        onCancel={async () => {
          await syncViewProperties?.();
          closePersonalView?.();
          setIsConfirmOpen(false);
        }}
      />
    </Fragment>
  );
};
