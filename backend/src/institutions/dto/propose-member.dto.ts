import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Matches ProposeNewMember(applicantID string, applicantName string) -
// chaincode/institution-cc/governance.go.
export class ProposeMemberDto {
  @ApiProperty({ example: 'InstitutionBMSP' })
  @IsString()
  @IsNotEmpty()
  applicantId!: string;

  @ApiProperty({ example: 'Institution B' })
  @IsString()
  @IsNotEmpty()
  applicantName!: string;
}
