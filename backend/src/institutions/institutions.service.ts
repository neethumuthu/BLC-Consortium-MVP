import { Injectable } from '@nestjs/common';
import { FabricGatewayService } from '../fabric-gateway/fabric-gateway.service';
import { InstitutionDto } from './dto/institution.dto';

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
}
