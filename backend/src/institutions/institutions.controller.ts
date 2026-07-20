import { Controller, Get, Param } from '@nestjs/common';
import { InstitutionsService } from './institutions.service';
import { CertificatesService } from '../certificates/certificates.service';
import { InstitutionDto } from './dto/institution.dto';
import { CertificateDto } from '../certificates/dto/certificate.dto';

@Controller('institutions')
export class InstitutionsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly certificatesService: CertificatesService,
  ) {}

  @Get()
  getAllInstitutions(): Promise<InstitutionDto[]> {
    return this.institutionsService.getAllInstitutions();
  }

  @Get(':institutionId')
  getInstitution(@Param('institutionId') institutionId: string): Promise<InstitutionDto> {
    return this.institutionsService.getInstitution(institutionId);
  }

  @Get(':institutionId/certificates')
  getCertificatesByInstitution(
    @Param('institutionId') institutionId: string,
  ): Promise<CertificateDto[]> {
    return this.certificatesService.getCertificatesByInstitution(institutionId);
  }
}
