import { ApiProperty } from '@nestjs/swagger';
import { CertificateDto } from './certificate.dto';

// Mirrors chaincode/certificate-cc/model.go's VerificationResult.
export class VerificationResultDto {
  @ApiProperty({ enum: ['VALID', 'TAMPERED', 'REVOKED'] })
  status!: 'VALID' | 'TAMPERED' | 'REVOKED';

  @ApiProperty({ type: CertificateDto })
  certificate!: CertificateDto;
}
