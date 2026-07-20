import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { MochiLocalRealtimeModule } from './features/mochi-sqlite/mochi-local-realtime.module';

@Module({
  imports: [MochiLocalRealtimeModule],
})
class MochiLocalModule {}

async function bootstrap() {
  const app = await NestFactory.create(MochiLocalModule);
  app.enableCors();
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  const port = Number(process.env.PORT || 3911);
  await app.listen(port);
  console.log(`Mochi local SQLite API ready on http://localhost:${port}/api/mochi`);
}

void bootstrap();
