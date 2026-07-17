import { GridViewOperators, ToolBarAddRecordButton } from './components';
import { useViewConfigurable } from './hook';
import { Others } from './Others';

interface GridToolBarProps {
  onCreatedRecords?: () => void;
}

export const GridToolBar: React.FC<GridToolBarProps> = ({ onCreatedRecords }) => {
  const { isViewConfigurable } = useViewConfigurable();

  return (
    <div className="flex h-[48px] items-center border-t px-1 py-2 sm:gap-1 sm:px-2 md:gap-2 md:px-4">
      <ToolBarAddRecordButton onCreatedRecord={() => onCreatedRecords?.()} />
      <div className="flex min-w-0 flex-1 justify-between @container/toolbar">
        <GridViewOperators disabled={!isViewConfigurable} />
        <Others />
      </div>
    </div>
  );
};
