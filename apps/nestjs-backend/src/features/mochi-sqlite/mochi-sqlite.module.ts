import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getMochiSqliteDatabasePath, MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';
import { MochiSqliteController } from './mochi-sqlite.controller';
import { MochiSqliteService } from './mochi-sqlite.service';

type MochiSqliteRuntimeModule = {
  MochiSqliteRepository: new (dbPath: string) => {
    init: () => void;
  };
};

@Module({
  controllers: [MochiSqliteController],
  providers: [
    {
      provide: MOCHI_SQLITE_REPOSITORY,
      useFactory: async () => {
        const moduleUrl = pathToFileURL(
          resolve(process.cwd(), '../../packages/mochi-sqlite/src/index.mjs')
        ).href;
        const { MochiSqliteRepository } = (await import(
          /* webpackIgnore: true */ moduleUrl
        )) as MochiSqliteRuntimeModule;
        const repository = new MochiSqliteRepository(getMochiSqliteDatabasePath());
        repository.init();
        return repository;
      },
    },
    MochiSqliteService,
  ],
  exports: [MochiSqliteService],
})
export class MochiSqliteModule {}
