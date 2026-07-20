import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getMochiSqliteDatabasePath, MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';
import { MochiLocalCompatController } from './mochi-local-compat.controller';
import { MochiSqliteController } from './mochi-sqlite.controller';
import { MochiSqliteService } from './mochi-sqlite.service';
import { MochiTeableApiController } from './mochi-teable-api.controller';

type MochiSqliteRuntimeModule = {
  MochiSqliteRepository: new (dbPath: string) => {
    init: () => void;
  };
};

@Module({
  controllers: [MochiSqliteController, MochiTeableApiController, MochiLocalCompatController],
  providers: [
    {
      provide: MOCHI_SQLITE_REPOSITORY,
      useFactory: async () => {
        const moduleUrl = pathToFileURL(
          process.env.MOCHI_SQLITE_RUNTIME_MODULE_PATH ||
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
