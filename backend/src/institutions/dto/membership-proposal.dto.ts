import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors chaincode/institution-cc/model.go's ProposalWithVoteStatus -
// MembershipProposal's fields plus the calling institution's own vote,
// computed fresh per call by the chaincode (see queries.go's
// withCallerVoteStatus), never stored on the ledger asset itself.
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

  @ApiPropertyOptional({
    enum: ['yes', 'no'],
    description: 'This instance\'s own institution\'s vote on this proposal, if it has voted. Absent if it has not.',
  })
  callerVoteDecision?: string;
}
