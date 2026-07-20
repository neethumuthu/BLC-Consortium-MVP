import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { FabricGatewayModule } from './fabric-gateway/fabric-gateway.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { CertificatesModule } from './certificates/certificates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ?? '.env',
      validate,
    }),
    FabricGatewayModule,
    InstitutionsModule,
    CertificatesModule,
  ],
})
export class AppModule {}
