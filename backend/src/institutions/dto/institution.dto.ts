import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors chaincode/institution-cc/model.go's Institution struct.
// status is only ever observed as "active" - RegisterInstitution and
// CastVote's applicant-creation path both set institutionStatusActive
// unconditionally; there is no other value any function ever writes.
export class InstitutionDto {
  @ApiProperty({ example: 'BLCFounderMSP' })
  institutionId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ enum: ['founding', 'approved'] })
  type!: string;

  @ApiProperty()
  joinedAt!: string;

  @ApiPropertyOptional({ type: [String], description: 'Present for type: "approved"; absent for "founding"' })
  approvedBy?: string[];

  @ApiProperty()
  docType!: string;
}
