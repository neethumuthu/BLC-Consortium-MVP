import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InstitutionsService } from './institutions.service';
import { CertificatesService } from '../certificates/certificates.service';
import { InstitutionDto } from './dto/institution.dto';
import { CertificateDto } from '../certificates/dto/certificate.dto';
import { MembershipProposalDto } from './dto/membership-proposal.dto';
import { ProposeMemberDto } from './dto/propose-member.dto';
import { CastVoteDto } from './dto/cast-vote.dto';

@ApiTags('institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(
    private readonly institutionsService: InstitutionsService,
    private readonly certificatesService: CertificatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every institution in the consortium' })
  @ApiResponse({ status: 200, type: [InstitutionDto] })
  getAllInstitutions(): Promise<InstitutionDto[]> {
    return this.institutionsService.getAllInstitutions();
  }

  // Literal "proposals" routes must be declared before the wildcard
  // :institutionId routes below - Nest/Express match GET routes in
  // declaration order, so :institutionId would otherwise shadow
  // "proposals" as a literal, treating it as an institutionId value.
  // Confirmed live: GET /institutions/proposals returned "institution
  // proposals does not exist" - GetInstitution's own error message -
  // before this was fixed.
  @Post('proposals')
  @ApiOperation({ summary: 'Propose a new member institution, as this instance\'s institution' })
  @ApiResponse({ status: 201, type: MembershipProposalDto })
  @ApiResponse({ status: 403, description: 'Caller is not an active institution' })
  @ApiResponse({ status: 409, description: 'Applicant is already a member, or already has an open/approved proposal' })
  proposeNewMember(@Body() dto: ProposeMemberDto): Promise<MembershipProposalDto> {
    return this.institutionsService.proposeNewMember(dto);
  }

  @Get('proposals')
  @ApiOperation({ summary: 'List every currently open membership proposal' })
  @ApiResponse({ status: 200, type: [MembershipProposalDto] })
  getOpenProposals(): Promise<MembershipProposalDto[]> {
    return this.institutionsService.getOpenProposals();
  }

  // Same route-ordering requirement as 'proposals' above, one level
  // deeper: 'proposals/resolved' must be declared before
  // 'proposals/:proposalId' or the wildcard would shadow it, treating
  // "resolved" as a proposalId value.
  @Get('proposals/resolved')
  @ApiOperation({ summary: 'List every membership proposal that has resolved (approved or rejected)' })
  @ApiResponse({ status: 200, type: [MembershipProposalDto] })
  getResolvedProposals(): Promise<MembershipProposalDto[]> {
    return this.institutionsService.getResolvedProposals();
  }

  @Get('proposals/:proposalId')
  @ApiOperation({ summary: 'Look up a membership proposal by ID' })
  @ApiParam({ name: 'proposalId' })
  @ApiResponse({ status: 200, type: MembershipProposalDto })
  getProposal(@Param('proposalId') proposalId: string): Promise<MembershipProposalDto> {
    return this.institutionsService.getProposal(proposalId);
  }

  @Post('proposals/:proposalId/vote')
  @ApiOperation({ summary: 'Cast a yes/no vote on an open membership proposal' })
  @ApiParam({ name: 'proposalId' })
  @ApiResponse({ status: 201, type: MembershipProposalDto })
  @ApiResponse({ status: 403, description: 'Caller is the proposal\'s own applicant, or not an active institution' })
  @ApiResponse({ status: 409, description: 'Caller has already voted, or the proposal is no longer open' })
  castVote(
    @Param('proposalId') proposalId: string,
    @Body() dto: CastVoteDto,
  ): Promise<MembershipProposalDto> {
    return this.institutionsService.castVote(proposalId, dto.decision);
  }

  @Get(':institutionId')
  @ApiOperation({ summary: 'Look up a single institution by MSP ID' })
  @ApiParam({ name: 'institutionId', example: 'BLCFounderMSP' })
  @ApiResponse({ status: 200, type: InstitutionDto })
  getInstitution(@Param('institutionId') institutionId: string): Promise<InstitutionDto> {
    return this.institutionsService.getInstitution(institutionId);
  }

  @Get(':institutionId/certificates')
  @ApiOperation({ summary: "List every certificate a given institution has issued" })
  @ApiParam({ name: 'institutionId', example: 'BLCFounderMSP' })
  @ApiResponse({ status: 200, type: [CertificateDto] })
  getCertificatesByInstitution(
    @Param('institutionId') institutionId: string,
  ): Promise<CertificateDto[]> {
    return this.certificatesService.getCertificatesByInstitution(institutionId);
  }
}
