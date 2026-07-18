import { FieldType, ViewType } from '@teable/core';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { AnchorContext, FieldContext, ViewContext } from '../context';
import type { IFieldInstance, IViewInstance } from '../model';
import { useFields } from './use-fields';

const buildField = (id: string, name: string): IFieldInstance =>
  ({
    id,
    name,
    type: FieldType.SingleLineText,
    canReadFieldRecord: true,
  }) as IFieldInstance;

const createWrapper = (fields: IFieldInstance[], view: IViewInstance) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnchorContext.Provider value={{ viewId: view.id }}>
      <ViewContext.Provider value={{ views: [view] }}>
        <FieldContext.Provider value={{ fields }}>{children}</FieldContext.Provider>
      </ViewContext.Provider>
    </AnchorContext.Provider>
  );
  wrapper.displayName = 'UseFieldsWrapper';
  return wrapper;
};

describe('useFields', () => {
  it('falls back to original field index when columnMeta only has partial order values', () => {
    const fields = [
      buildField('fldName', 'Name'),
      buildField('fldNameCopy', 'Name copy'),
      buildField('fldText', 'hello'),
      buildField('fldDate', 'hello date'),
      buildField('fldSmoke', 'UI reorder smoke'),
    ];
    const view = {
      id: 'viwTest',
      type: ViewType.Grid,
      columnMeta: {
        fldSmoke: { order: 2.5 },
      },
    } as unknown as IViewInstance;

    const { result } = renderHook(() => useFields(), {
      wrapper: createWrapper(fields, view),
    });

    expect(result.current.map(({ id }) => id)).toEqual([
      'fldName',
      'fldNameCopy',
      'fldText',
      'fldSmoke',
      'fldDate',
    ]);
  });
});
