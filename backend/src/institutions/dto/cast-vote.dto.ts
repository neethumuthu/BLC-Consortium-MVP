import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Matches CastVote(proposalID string, decision string)'s decision
// values exactly - chaincode/institution-cc/model.go's
// voteDecisionYes/voteDecisionNo constants ("yes"/"no"). The chaincode
// itself also rejects any other value; this fails fast at the HTTP
// layer with a clearer message instead of a round trip to Fabric.
export class CastVoteDto {
  @ApiProperty({ enum: ['yes', 'no'] })
  @IsIn(['yes', 'no'])
  decision!: string;
}
