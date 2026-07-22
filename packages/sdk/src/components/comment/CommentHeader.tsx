import { useTranslation } from '../../context/app/i18n';
import type { IBaseQueryParams } from './types';

interface ICommentHeaderProps extends IBaseQueryParams {}

export const CommentHeader = (_props: ICommentHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-[52px] items-center border-b p-1 px-3">
      <div>{t('comment.title')}</div>
    </div>
  );
};
