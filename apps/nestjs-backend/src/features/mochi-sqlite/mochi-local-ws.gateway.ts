import type http from 'http';
import type { AdaptableWebSocket } from '@an-epiphany/websocket-json-stream';
import { WebSocketJSONStream } from '@an-epiphany/websocket-json-stream';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import sockjs from 'sockjs';
import { MochiLocalShareDbService } from './mochi-local-sharedb.service';

@Injectable()
export class MochiLocalWsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MochiLocalWsGateway.name);
  private sockjsServer: sockjs.Server | null = null;
  private readonly activeConnections = new Set<sockjs.Connection>();

  constructor(
    private readonly shareDb: MochiLocalShareDbService,
    private readonly httpAdapterHost: HttpAdapterHost
  ) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer() as http.Server;
    this.sockjsServer = sockjs.createServer({
      prefix: '/socket',
      transports: ['websocket', 'xhr-streaming'],
      response_limit: 2 * 1024 * 1024,
      log: (severity: string, message: string) => {
        if (severity === 'error') this.logger.error(message);
        else this.logger.debug(message);
      },
    } as sockjs.ServerOptions & { transports: string[]; response_limit: number });

    this.sockjsServer.on('connection', this.handleConnection);
    this.sockjsServer.installHandlers(httpServer);
    this.logger.log('Mochi local SockJS gateway initialized at /socket');
  }

  private handleConnection = (conn: sockjs.Connection) => {
    this.activeConnections.add(conn);
    conn.on('close', () => this.activeConnections.delete(conn));

    try {
      const stream = new WebSocketJSONStream(conn as unknown as AdaptableWebSocket, {
        adapterType: 'sockjs-node',
      });
      this.shareDb.listen(stream, {
        url: conn.url || '/socket',
        headers: conn.headers || {},
      } as unknown as Request);
    } catch (error) {
      this.logger.error('Mochi local socket connection error', error);
      conn.close();
      this.activeConnections.delete(conn);
    }
  };

  async onModuleDestroy() {
    for (const conn of this.activeConnections) {
      conn.close();
    }
    this.activeConnections.clear();
    await new Promise<void>((resolve, reject) => {
      this.shareDb.close((error) => (error ? reject(error) : resolve()));
    });
    this.sockjsServer = null;
  }
}
