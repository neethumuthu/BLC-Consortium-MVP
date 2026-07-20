import { Module } from '@nestjs/common';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [CertificatesModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
})
export class InstitutionsModule {}
