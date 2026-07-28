import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InstitutionsService } from './institutions.service';
import { CertificatesService } from '../certificates/certificates.service';
import { InstitutionDto } from './dto/institution.dto';
import { CertificateDto } from '../certificates/dto/certificate.dto';

@ApiTags('institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly certificatesService: CertificatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every institution in the consortium' })
  @ApiResponse({ status: 200, type: [InstitutionDto] })
  getAllInstitutions(): Promise<InstitutionDto[]> {
    return this.institutionsService.getAllInstitutions();
  }

  @Get(':institutionId')
  @ApiOperation({ summary: 'Look up a single institution by MSP ID' })
  @ApiParam({ name: 'institutionId', example: 'BLCFounderMSP' })
  @ApiResponse({ status: 200, type: InstitutionDto })
  getInstitution(@Param('institutionId') institutionId: string): Promise<InstitutionDto> {
    return this.institutionsService.getInstitution(institutionId);
  }

  @Get(':institutionId/certificates')
  @ApiOperation({ summary: "List every certificate a given institution has issued" })
  @ApiParam({ name: 'institutionId', example: 'BLCFounderMSP' })
  @ApiResponse({ status: 200, type: [CertificateDto] })
  getCertificatesByInstitution(
    @Param('institutionId') institutionId: string,
  ): Promise<CertificateDto[]> {
    return this.certificatesService.getCertificatesByInstitution(institutionId);
  }
}
