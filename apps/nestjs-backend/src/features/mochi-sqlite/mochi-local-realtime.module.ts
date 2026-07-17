import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MochiLocalActionTriggerListener } from './mochi-local-action-trigger.listener';
import { MochiLocalShareDbService } from './mochi-local-sharedb.service';
import { MochiLocalWsGateway } from './mochi-local-ws.gateway';
import { MochiSqliteModule } from './mochi-sqlite.module';

@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', global: true }), MochiSqliteModule],
  providers: [MochiLocalShareDbService, MochiLocalWsGateway, MochiLocalActionTriggerListener],
  exports: [MochiLocalShareDbService],
})
export class MochiLocalRealtimeModule {}
