import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CredentialStoreService } from './credential-store.service';

// @Global(): CredentialStoreService is a cross-cutting dependency of
// ApiKeyGuard (provided directly in AppModule, applied to every route
// via app.useGlobalGuards), same reasoning as FabricGatewayModule.
@Global()
@Module({
  controllers: [AuthController],
  providers: [CredentialStoreService],
  exports: [CredentialStoreService],
})
export class AuthModule {}
