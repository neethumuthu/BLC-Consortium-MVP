import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { CertificateDto } from './dto/certificate.dto';
import { VerificationResultDto } from './dto/verification-result.dto';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  issueCertificate(@Body() dto: IssueCertificateDto): Promise<CertificateDto> {
    return this.certificatesService.issueCertificate(dto);
  }

  @Get(':certificateId')
  getCertificate(@Param('certificateId') certificateId: string): Promise<CertificateDto> {
    return this.certificatesService.getCertificate(certificateId);
  }

  @Get(':certificateId/verification')
  verifyCertificate(
    @Param('certificateId') certificateId: string,
  ): Promise<VerificationResultDto> {
    return this.certificatesService.verifyCertificate(certificateId);
  }

  @Post(':certificateId/revoke')
  @HttpCode(HttpStatus.OK)
  revokeCertificate(
    @Param('certificateId') certificateId: string,
    @Body() dto: RevokeCertificateDto,
  ): Promise<CertificateDto> {
    return this.certificatesService.revokeCertificate(certificateId, dto.reason);
  }
}
