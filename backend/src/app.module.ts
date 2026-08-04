import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { FabricGatewayModule } from './fabric-gateway/fabric-gateway.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { CertificatesModule } from './certificates/certificates.module';
import { AuthModule } from './auth/auth.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ?? '.env',
      validate,
    }),
    FabricGatewayModule,
    AuthModule,
    InstitutionsModule,
    CertificatesModule,
  ],
  providers: [ApiKeyGuard],
})
export class AppModule {}
