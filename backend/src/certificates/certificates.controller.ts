import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { CertificateDto } from './dto/certificate.dto';
import { VerificationResultDto } from './dto/verification-result.dto';

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  @ApiOperation({ summary: 'Issue a certificate as this instance\'s institution' })
  @ApiResponse({ status: 201, type: CertificateDto })
  issueCertificate(@Body() dto: IssueCertificateDto): Promise<CertificateDto> {
    return this.certificatesService.issueCertificate(dto);
  }

  @Get(':certificateId')
  @ApiOperation({ summary: 'Look up a certificate by ID' })
  @ApiParam({ name: 'certificateId' })
  @ApiResponse({ status: 200, type: CertificateDto })
  getCertificate(@Param('certificateId') certificateId: string): Promise<CertificateDto> {
    return this.certificatesService.getCertificate(certificateId);
  }

  @Get(':certificateId/verification')
  @ApiOperation({ summary: 'Verify a certificate - checks tampering, then revocation' })
  @ApiParam({ name: 'certificateId' })
  @ApiResponse({ status: 200, type: VerificationResultDto })
  verifyCertificate(
    @Param('certificateId') certificateId: string,
  ): Promise<VerificationResultDto> {
    return this.certificatesService.verifyCertificate(certificateId);
  }

  @Post(':certificateId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a certificate - only the original issuer may call this' })
  @ApiParam({ name: 'certificateId' })
  @ApiResponse({ status: 200, type: CertificateDto })
  @ApiResponse({ status: 403, description: 'Caller is not this certificate\'s issuer' })
  @ApiResponse({ status: 409, description: 'Certificate is already revoked' })
  revokeCertificate(
    @Param('certificateId') certificateId: string,
    @Body() dto: RevokeCertificateDto,
  ): Promise<CertificateDto> {
    return this.certificatesService.revokeCertificate(certificateId, dto.reason);
  }
}
