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

  @Post('tables/:tableId/search/rebuild')
  rebuildSearchIndex(@Param('tableId') tableId: string) {
    return this.mochiSqliteService.rebuildSearchIndex(tableId);
  }

  @Post('tables/:tableId/lookup-rollup/resolve')
  resolveLookupRollup(@Param('tableId') tableId: string, @Body() body: { recordId?: string }) {
    return this.mochiSqliteService.resolveLookupRollup(tableId, body);
  }

  @Post('tables/:tableId/formulas/resolve')
  resolveFormulas(@Param('tableId') tableId: string, @Body() body: { recordId?: string }) {
    return this.mochiSqliteService.resolveFormulas(tableId, body);
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

  @Get('records/:recordId/attachments')
  listRecordAttachments(@Param('recordId') recordId: string) {
    return this.mochiSqliteService.listRecordAttachments(recordId);
  }

  @Post('records/:recordId/attachments')
  attachToRecord(
    @Param('recordId') recordId: string,
    @Body() body: { attachmentId: string; tableId: string; fieldId: string }
  ) {
    return this.mochiSqliteService.attachToRecord({ ...body, recordId });
  }

  @Get('trash')
  listTrash() {
    return this.mochiSqliteService.listTrash();
  }

  @Post('trash/:trashId/restore')
  restoreTrash(@Param('trashId') trashId: string) {
    return this.mochiSqliteService.restoreTrash(trashId);
  }

  @Get('attachments')
  listAttachments() {
    return this.mochiSqliteService.listAttachments();
  }

  @Post('attachments')
  createAttachment(
    @Body()
    body: {
      token?: string;
      name?: string;
      hash?: string;
      size?: number;
      mimetype?: string;
      path: string;
      width?: number;
      height?: number;
      thumbnailPath?: string;
    }
  ) {
    return this.mochiSqliteService.createAttachment(body);
  }

  @Get('attachments/:attachmentId')
  getAttachment(@Param('attachmentId') attachmentId: string) {
    return this.mochiSqliteService.getAttachment(attachmentId);
  }

  @Delete('attachments/:attachmentId')
  deleteAttachment(@Param('attachmentId') attachmentId: string) {
    return this.mochiSqliteService.deleteAttachment(attachmentId);
  }

  @Get('imports')
  listImportSources() {
    return this.mochiSqliteService.listImportSources();
  }

  @Post('imports/sqlite')
  importSqliteDatabase(
    @Body()
    body: {
      path: string;
      baseId?: string;
      baseName?: string;
      spaceId?: string;
      profileId?: string;
      tables?: string[];
      tableNamePrefix?: string;
      limit?: number;
    }
  ) {
    return this.mochiSqliteService.importSqliteDatabase(body);
  }

  @Post('imports/file')
  importFile(
    @Body()
    body: {
      fileName?: string;
      fileType: 'csv' | 'excel';
      contentBase64: string;
      baseId?: string;
      tableName?: string;
      limit?: number;
    }
  ) {
    return this.mochiSqliteService.importFile(body);
  }

  @Get('computed/jobs')
  listComputedJobs(@Query('status') status?: string) {
    return this.mochiSqliteService.listComputedJobs(status);
  }

  @Post('computed/jobs')
  enqueueComputedJob(
    @Body()
    body: {
      tableId: string;
      recordId?: string;
      fieldId?: string;
      jobType?: string;
      payload?: unknown;
    }
  ) {
    return this.mochiSqliteService.enqueueComputedJob(body);
  }

  @Post('computed/jobs/claim')
  claimNextComputedJob() {
    return this.mochiSqliteService.claimNextComputedJob();
  }

  @Post('computed/jobs/:jobId/complete')
  completeComputedJob(@Param('jobId') jobId: string) {
    return this.mochiSqliteService.completeComputedJob(jobId);
  }

  @Post('computed/jobs/:jobId/fail')
  failComputedJob(@Param('jobId') jobId: string, @Body() body: { error?: string }) {
    return this.mochiSqliteService.failComputedJob(jobId, body?.error);
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
