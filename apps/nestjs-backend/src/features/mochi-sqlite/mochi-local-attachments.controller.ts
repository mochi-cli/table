import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { INotifyVo, SignatureVo } from '@teable/openapi';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { getMochiSqliteDatabasePath } from './mochi-sqlite.constants';
import { MochiSqliteService } from './mochi-sqlite.service';

type LocalSignature = {
  contentLength?: number;
  contentType?: string;
  path: string;
  token: string;
};

type LocalAttachment = {
  token?: string;
  mimetype?: string;
};

const localUploadRoot = () => join(dirname(getMochiSqliteDatabasePath()), 'attachments');

const safeFileName = (value?: string) => {
  const fileName = String(value ?? 'attachment')
    .replace(/[\\/]/g, '_')
    .trim();
  return fileName || 'attachment';
};

const attachmentUrlFor = (token: string, filename?: string) =>
  `/api/attachments/read/${encodeURIComponent(token)}?filename=${encodeURIComponent(
    safeFileName(filename)
  )}`;

@Public()
@Controller('api/attachments')
export class MochiLocalAttachmentsController {
  private readonly signatures = new Map<string, LocalSignature>();

  constructor(private readonly mochiSqliteService: MochiSqliteService) {}

  @Post('signature')
  signature(
    @Req() request: Request & { body?: { contentLength?: number; contentType?: string } }
  ): SignatureVo {
    const token = `mochi_${randomUUID().replaceAll('-', '')}`;
    const uploadPath = join(localUploadRoot(), token);
    this.signatures.set(token, {
      contentLength: request.body?.contentLength,
      contentType: request.body?.contentType,
      path: uploadPath,
      token,
    });

    return {
      url: `/api/attachments/upload/${encodeURIComponent(token)}`,
      uploadMethod: 'PUT',
      token,
      requestHeaders: {
        'Content-Type': request.body?.contentType ?? 'application/octet-stream',
      },
    };
  }

  @Put('upload/:token')
  async upload(@Param('token') token: string, @Req() request: Request): Promise<null> {
    const signature = this.signatures.get(token);
    const uploadPath = signature?.path ?? join(localUploadRoot(), token);
    mkdirSync(dirname(uploadPath), { recursive: true });
    await pipeline(request, createWriteStream(uploadPath));
    return null;
  }

  @Post('notify/:token')
  notify(@Param('token') token: string, @Query('filename') filename?: string): INotifyVo {
    const signature = this.signatures.get(token);
    const uploadPath = signature?.path ?? join(localUploadRoot(), token);
    if (!existsSync(uploadPath)) {
      throw new Error(`Uploaded file not found for token ${token}`);
    }

    const size = statSync(uploadPath).size;
    const hash = createHash('sha1').update(token).digest('hex');
    const name = safeFileName(filename);
    const mimetype = signature?.contentType ?? 'application/octet-stream';
    const path = uploadPath;
    const url = attachmentUrlFor(token, name);

    this.mochiSqliteService.createAttachment({
      token,
      name,
      hash,
      size,
      mimetype,
      path,
    });

    return {
      token,
      size,
      url,
      path,
      mimetype,
      presignedUrl: url,
    };
  }

  @Get('read/:token')
  read(
    @Param('token') token: string,
    @Query('filename') filename: string | undefined,
    @Res() response: Response
  ) {
    const uploadPath = this.signatures.get(token)?.path ?? join(localUploadRoot(), token);
    if (!existsSync(uploadPath)) {
      response.status(404).send('Not found');
      return;
    }
    const signature = this.signatures.get(token);
    const attachment = (this.mochiSqliteService.listAttachments() as LocalAttachment[]).find(
      (item) => item.token === token
    );
    const contentType =
      signature?.contentType ?? attachment?.mimetype ?? 'application/octet-stream';
    response.setHeader('Cross-Origin-Resource-Policy', 'unsafe-none');
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `inline; filename="${safeFileName(filename)}"`);
    createReadStream(uploadPath).pipe(response);
  }
}
