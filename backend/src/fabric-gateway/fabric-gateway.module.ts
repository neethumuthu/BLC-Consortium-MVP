import { Global, Module } from '@nestjs/common';
import { FabricGatewayService } from './fabric-gateway.service';

@Global()
@Module({
  providers: [FabricGatewayService],
  exports: [FabricGatewayService],
})
export class FabricGatewayModule {}
