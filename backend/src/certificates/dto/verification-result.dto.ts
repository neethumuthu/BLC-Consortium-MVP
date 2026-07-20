import { CertificateDto } from './certificate.dto';

// Mirrors chaincode/certificate-cc/model.go's VerificationResult.
export class VerificationResultDto {
  status!: 'VALID' | 'TAMPERED' | 'REVOKED';
  certificate!: CertificateDto;
}
