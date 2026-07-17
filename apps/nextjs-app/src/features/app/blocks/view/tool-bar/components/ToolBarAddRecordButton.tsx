import { Plus } from '@teable/icons';
import { CreateRecordModal } from '@teable/sdk/components';
import { useIsReadOnlyPreview, useTablePermission } from '@teable/sdk/hooks';
import { Button } from '@teable/ui-lib/shadcn/ui/button';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { tableConfig } from '@/features/i18n/table.config';

interface ToolBarAddRecordButtonProps {
  onCreatedRecord?: (recordId: string) => void;
}

export const ToolBarAddRecordButton = ({ onCreatedRecord }: ToolBarAddRecordButtonProps) => {
  const permission = useTablePermission();
  const router = useRouter();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const isReadOnlyPreview = useIsReadOnlyPreview();
  const buttonText = router.pathname === '/mochi/local' ? 'Add record' : t('table:view.addRecord');

  if (isReadOnlyPreview) {
    return null;
  }

  return (
    <CreateRecordModal callback={onCreatedRecord}>
      <Button size={'xs'} variant={'outline'} disabled={!permission['record|create']}>
        <Plus className="size-4" />
        {buttonText}
      </Button>
    </CreateRecordModal>
  );
};
