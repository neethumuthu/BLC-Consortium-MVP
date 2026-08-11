import { Injectable } from '@nestjs/common';
import { FabricGatewayService } from '../fabric-gateway/fabric-gateway.service';
import { InstitutionDto } from './dto/institution.dto';
import { MembershipProposalDto } from './dto/membership-proposal.dto';
import { ProposeMemberDto } from './dto/propose-member.dto';

const utf8Decoder = new TextDecoder();

@Injectable()
export class InstitutionsService {
  constructor(private readonly fabricGateway: FabricGatewayService) {}

  async getInstitution(institutionId: string): Promise<InstitutionDto> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.evaluateTransaction('GetInstitution', institutionId);
    return JSON.parse(utf8Decoder.decode(result)) as InstitutionDto;
  }

  async getAllInstitutions(): Promise<InstitutionDto[]> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.evaluateTransaction('GetAllInstitutions');
    // GetAllInstitutions' Go implementation initializes its slice as
    // []*Institution{}, never nil - an empty result always
    // deserializes as [], no null-handling needed here.
    return JSON.parse(utf8Decoder.decode(result)) as InstitutionDto[];
  }

  async proposeNewMember(dto: ProposeMemberDto): Promise<MembershipProposalDto> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.submitTransaction(
      'ProposeNewMember',
      dto.applicantId,
      dto.applicantName,
    );
    return JSON.parse(utf8Decoder.decode(result)) as MembershipProposalDto;
  }

  async castVote(proposalId: string, decision: string): Promise<MembershipProposalDto> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.submitTransaction('CastVote', proposalId, decision);
    return JSON.parse(utf8Decoder.decode(result)) as MembershipProposalDto;
  }

  async getOpenProposals(): Promise<MembershipProposalDto[]> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.evaluateTransaction('GetOpenProposals');
    // Same as GetAllInstitutions: the Go implementation initializes its
    // slice as []*MembershipProposal{}, never nil.
    return JSON.parse(utf8Decoder.decode(result)) as MembershipProposalDto[];
  }

  async getProposal(proposalId: string): Promise<MembershipProposalDto> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.evaluateTransaction('GetProposal', proposalId);
    return JSON.parse(utf8Decoder.decode(result)) as MembershipProposalDto;
  }

  async getResolvedProposals(): Promise<MembershipProposalDto[]> {
    const contract = this.fabricGateway.getInstitutionContract();
    const result = await contract.evaluateTransaction('GetResolvedProposals');
    // Same as GetOpenProposals/GetAllInstitutions: the Go implementation
    // initializes its slice as []*ProposalWithVoteStatus{}, never nil.
    return JSON.parse(utf8Decoder.decode(result)) as MembershipProposalDto[];
  }
}
