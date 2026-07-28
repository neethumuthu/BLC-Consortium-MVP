import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors chaincode/certificate-cc/model.go's Certificate struct
// exactly - nothing added, nothing renamed.
export class CertificateDto {
  @ApiProperty()
  certificateId!: string;

  @ApiProperty({ description: 'Sequential number across all institutions' })
  consortiumNumber!: number;

  @ApiProperty({ description: "Sequential number within this certificate's own issuer" })
  issuerSequenceNumber!: number;

  @ApiProperty()
  holderName!: string;

  @ApiProperty()
  holderDetails!: string;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, unknown>;

  @ApiProperty()
  certificateHash!: string;

  @ApiProperty()
  issuerId!: string;

  @ApiProperty()
  issuedAt!: string;

  @ApiProperty({ enum: ['active', 'revoked'] })
  status!: string;

  @ApiPropertyOptional()
  revokedAt?: string;

  @ApiPropertyOptional()
  revokedReason?: string;

  @ApiProperty()
  docType!: string;
}
