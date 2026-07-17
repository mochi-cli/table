import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MochiSqliteService } from './mochi-sqlite.service';

const parseJsonQuery = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseNumberQuery = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

@Public()
@Controller('api/mochi')
export class MochiSqliteController {
  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  @Get('spaces')
  listSpaces() {
    return this.mochiSqliteService.listSpaces();
  }

  @Post('spaces')
  createSpace(@Body() body: { id?: string; name: string; avatar?: string }) {
    return this.mochiSqliteService.createSpace(body);
  }

  @Get('spaces/:spaceId')
  getSpace(@Param('spaceId') spaceId: string) {
    return this.mochiSqliteService.getSpace(spaceId);
  }

  @Get('bases')
  listBases(@Query('spaceId') spaceId?: string) {
    return this.mochiSqliteService.listBases(spaceId);
  }

  @Post('bases')
  createBase(@Body() body: { name: string; spaceId?: string; icon?: string }) {
    return this.mochiSqliteService.createBase(body);
  }

  @Get('bases/:baseId')
  getBase(@Param('baseId') baseId: string) {
    return this.mochiSqliteService.getBase(baseId);
  }

  @Get('bases/:baseId/tables')
  listTables(@Param('baseId') baseId: string) {
    return this.mochiSqliteService.listTables(baseId);
  }

  @Post('bases/:baseId/tables')
  createTable(
    @Param('baseId') baseId: string,
    @Body() body: { name: string; description?: string; primaryFieldName?: string }
  ) {
    return this.mochiSqliteService.createTable({ ...body, baseId });
  }

  @Get('tables/:tableId')
  getTable(@Param('tableId') tableId: string) {
    return this.mochiSqliteService.getTable(tableId);
  }

  @Get('tables/:tableId/fields')
  listFields(@Param('tableId') tableId: string) {
    return this.mochiSqliteService.listFields(tableId);
  }

  @Post('tables/:tableId/fields')
  createField(
    @Param('tableId') tableId: string,
    @Body()
    body: {
      name: string;
      type: string;
      cellValueType?: string;
    }
  ) {
    return this.mochiSqliteService.createField({ ...body, tableId });
  }

  @Get('fields/:fieldId')
  getField(@Param('fieldId') fieldId: string) {
    return this.mochiSqliteService.getField(fieldId);
  }

  @Patch('fields/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body() body: Record<string, unknown>) {
    return this.mochiSqliteService.updateField(fieldId, body);
  }

  @Get('tables/:tableId/views')
  listViews(@Param('tableId') tableId: string) {
    return this.mochiSqliteService.listViews(tableId);
  }

  @Post('tables/:tableId/views')
  createView(
    @Param('tableId') tableId: string,
    @Body()
    body: {
      name: string;
      type?: string;
      options?: Record<string, unknown>;
      columnMeta?: Record<string, unknown>;
      filter?: Record<string, unknown>;
      sort?: Record<string, unknown>;
      group?: Record<string, unknown>;
    }
  ) {
    return this.mochiSqliteService.createView({ ...body, tableId });
  }

  @Get('views/:viewId')
  getView(@Param('viewId') viewId: string) {
    return this.mochiSqliteService.getView(viewId);
  }

  @Get('tables/:tableId/records')
  listRecords(
    @Param('tableId') tableId: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('filters') filters?: string,
    @Query('sorts') sorts?: string
  ) {
    return this.mochiSqliteService.listRecords(tableId, {
      search,
      limit: parseNumberQuery(limit, 100),
      offset: parseNumberQuery(offset, 0),
      filters: parseJsonQuery<unknown[]>(filters, []),
      sorts: parseJsonQuery<unknown[]>(sorts, []),
    });
  }

  @Post('tables/:tableId/records')
  createRecord(
    @Param('tableId') tableId: string,
    @Body() body: { fields?: Record<string, unknown> }
  ) {
    return this.mochiSqliteService.createRecord({ ...body, tableId });
  }

  @Patch('records/:recordId')
  updateRecord(
    @Param('recordId') recordId: string,
    @Body() body: { fields?: Record<string, unknown> }
  ) {
    return this.mochiSqliteService.updateRecord(recordId, body);
  }

  @Get('records/:recordId')
  getRecord(@Param('recordId') recordId: string) {
    return this.mochiSqliteService.getRecord(recordId);
  }

  @Delete('records/:recordId')
  deleteRecordByMethod(@Param('recordId') recordId: string) {
    return this.mochiSqliteService.deleteRecord(recordId);
  }

  @Post('records/:recordId/delete')
  deleteRecord(@Param('recordId') recordId: string) {
    return this.mochiSqliteService.deleteRecord(recordId);
  }

  @Post('undo')
  undo() {
    return this.mochiSqliteService.undo();
  }

  @Post('redo')
  redo() {
    return this.mochiSqliteService.redo();
  }
}
