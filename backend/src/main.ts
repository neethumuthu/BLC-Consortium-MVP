import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FabricExceptionFilter } from './common/filters/fabric-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new FabricExceptionFilter());
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const mspId = config.getOrThrow<string>('MSP_ID');

  // One Swagger UI per running instance, labeled with the org it acts
  // as - this instance is always exactly one organization's Gateway
  // (see ARCHITECTURE.md's "Key decisions" #10 on the no-HTTP-auth
  // scope this labeling doesn't change).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BLC-31 Fabric Gateway')
    .setDescription(`Certificate lifecycle + institution lookups, running as ${mspId}`)
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = config.getOrThrow<number>('HTTP_PORT');
  await app.listen(port);
}

bootstrap();
