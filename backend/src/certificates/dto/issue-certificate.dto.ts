import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// Matches IssueCertificate(holderName string, holderDetails string,
// metadata map[string]interface{}) exactly - chaincode/certificate-cc/issuecertificate.go.
export class IssueCertificateDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  holderName!: string;

  @ApiProperty({ example: 'MSc Computer Science' })
  @IsString()
  @IsNotEmpty()
  holderDetails!: string;

  @ApiPropertyOptional({ example: {}, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
