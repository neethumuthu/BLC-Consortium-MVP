import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// Matches IssueCertificate(holderName string, holderDetails string,
// metadata map[string]interface{}) exactly - chaincode/certificate-cc/issuecertificate.go.
export class IssueCertificateDto {
  @IsString()
  @IsNotEmpty()
  holderName!: string;

  @IsString()
  @IsNotEmpty()
  holderDetails!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
