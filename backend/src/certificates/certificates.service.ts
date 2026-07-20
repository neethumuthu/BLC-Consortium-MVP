import { Injectable } from '@nestjs/common';
import { FabricGatewayService } from '../fabric-gateway/fabric-gateway.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { CertificateDto } from './dto/certificate.dto';
import { VerificationResultDto } from './dto/verification-result.dto';

const utf8Decoder = new TextDecoder();

@Injectable()
export class CertificatesService {
  constructor(private readonly fabricGateway: FabricGatewayService) {}

  async issueCertificate(dto: IssueCertificateDto): Promise<CertificateDto> {
    const contract = this.fabricGateway.getCertificateContract();
    // contractapi args are always plain strings server-side - a Go
    // map[string]interface{} param must be sent as a JSON-encoded
    // string, not a raw object. Same gotcha already hit live with the
    // peer CLI (docs/DEMO_PREP.md).
    const result = await contract.submitTransaction(
      'IssueCertificate',
      dto.holderName,
      dto.holderDetails,
      JSON.stringify(dto.metadata ?? {}),
    );
    return JSON.parse(utf8Decoder.decode(result)) as CertificateDto;
  }

  async revokeCertificate(certificateId: string, reason: string): Promise<CertificateDto> {
    const contract = this.fabricGateway.getCertificateContract();
    const result = await contract.submitTransaction('RevokeCertificate', certificateId, reason);
    return JSON.parse(utf8Decoder.decode(result)) as CertificateDto;
  }

  async getCertificate(certificateId: string): Promise<CertificateDto> {
    const contract = this.fabricGateway.getCertificateContract();
    const result = await contract.evaluateTransaction('GetCertificate', certificateId);
    return JSON.parse(utf8Decoder.decode(result)) as CertificateDto;
  }

  async verifyCertificate(certificateId: string): Promise<VerificationResultDto> {
    const contract = this.fabricGateway.getCertificateContract();
    const result = await contract.evaluateTransaction('VerifyCertificate', certificateId);
    return JSON.parse(utf8Decoder.decode(result)) as VerificationResultDto;
  }

  async getCertificatesByInstitution(institutionId: string): Promise<CertificateDto[]> {
    const contract = this.fabricGateway.getCertificateContract();
    const result = await contract.evaluateTransaction(
      'GetCertificatesByInstitution',
      institutionId,
    );
    // GetCertificatesByInstitution's Go implementation initializes its
    // slice as []*Certificate{}, never nil, so an empty result always
    // deserializes as [] - no null-handling needed here.
    return JSON.parse(utf8Decoder.decode(result)) as CertificateDto[];
  }
}
