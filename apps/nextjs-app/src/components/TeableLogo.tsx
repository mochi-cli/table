import { cn } from '@teable/ui-lib/shadcn';
import { useBrand } from '@/features/app/hooks/useBrand';

const MOCHI_LOGO_ICON = '/images/mochi/logo-icon.svg';

export const TeableLogo = ({ className }: { className: string }) => {
  const { brandName, brandLogo } = useBrand();

  return (
    <img
      src={brandLogo || MOCHI_LOGO_ICON}
      alt={brandName}
      width={64}
      height={64}
      className={cn('size-6', className)}
    />
  );
};
