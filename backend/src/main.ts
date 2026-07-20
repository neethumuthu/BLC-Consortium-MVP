import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { FabricExceptionFilter } from './common/filters/fabric-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new FabricExceptionFilter());
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('HTTP_PORT');
  await app.listen(port);
}

bootstrap();
