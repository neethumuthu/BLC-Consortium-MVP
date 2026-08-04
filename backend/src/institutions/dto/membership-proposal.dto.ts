import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors chaincode/institution-cc/model.go's MembershipProposal struct
// exactly - nothing added, nothing renamed.
export class MembershipProposalDto {
  @ApiProperty()
  proposalId!: string;

  @ApiProperty({ example: 'InstitutionBMSP' })
  applicantId!: string;

  @ApiProperty()
  applicantName!: string;

  @ApiProperty({ description: 'MSP ID of the institution that proposed this applicant' })
  proposedBy!: string;

  @ApiProperty({ enum: ['open', 'approved', 'rejected'] })
  status!: string;

  @ApiProperty()
  votesFor!: number;

  @ApiProperty()
  votesAgainst!: number;

  @ApiProperty({ description: 'Snapshotted when the proposal was created' })
  totalEligibleVoters!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Present once the proposal is approved or rejected; absent while open' })
  resolvedAt?: string;

  @ApiProperty()
  docType!: string;
}
