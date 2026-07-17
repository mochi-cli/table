import {
  AggregationProvider,
  RecordProvider,
  RowCountProvider,
  TaskStatusCollectionProvider,
} from '@teable/sdk/context';
import { SearchProvider } from '@teable/sdk/context/query';
import { usePersonalView } from '@teable/sdk/hooks';
import { GridToolBar } from '../tool-bar/GridToolBar';
import type { IViewBaseProps } from '../types';
import { GridViewBase } from './GridViewBase';

export const GridView = (props: IViewBaseProps) => {
  const { recordServerData, recordsServerData, groupPointsServerDataMap, onCreatedRecords } =
    props;
  const { personalViewCommonQuery, personalViewAggregationQuery } = usePersonalView();

  return (
    <SearchProvider>
      <RecordProvider serverRecords={recordsServerData.records} serverRecord={recordServerData}>
        <AggregationProvider query={personalViewAggregationQuery}>
          <TaskStatusCollectionProvider>
            <RowCountProvider query={personalViewCommonQuery}>
              <GridToolBar onCreatedRecords={onCreatedRecords} />
              <div className="w-full grow overflow-hidden sm:pl-2">
                <GridViewBase
                  groupPointsServerDataMap={groupPointsServerDataMap}
                  onCreatedRecords={onCreatedRecords}
                />
              </div>
            </RowCountProvider>
          </TaskStatusCollectionProvider>
        </AggregationProvider>
      </RecordProvider>
    </SearchProvider>
  );
};
