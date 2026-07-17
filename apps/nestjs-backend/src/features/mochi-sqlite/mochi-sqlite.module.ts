import { Module } from '@nestjs/common';
import { getMochiSqliteDatabasePath, MOCHI_SQLITE_REPOSITORY } from './mochi-sqlite.constants';
import { MochiSqliteService } from './mochi-sqlite.service';

@Module({
  providers: [
    {
      provide: MOCHI_SQLITE_REPOSITORY,
      useFactory: async () => {
        const { MochiSqliteRepository } = await import('@mochi/table-sqlite');
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
