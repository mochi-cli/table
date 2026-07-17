import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { MochiSqliteModule } from './features/mochi-sqlite/mochi-sqlite.module';

@Module({
  imports: [MochiSqliteModule],
})
class MochiLocalModule {}

async function bootstrap() {
  const app = await NestFactory.create(MochiLocalModule);
  app.enableCors();
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  console.log(`Mochi local SQLite API ready on http://localhost:${port}/api/mochi`);
}

void bootstrap();
