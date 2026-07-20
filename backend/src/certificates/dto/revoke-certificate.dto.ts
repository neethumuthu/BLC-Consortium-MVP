import { IsNotEmpty, IsString } from 'class-validator';

// Matches RevokeCertificate(certificateID string, reason string) -
// chaincode/certificate-cc/revokecertificate.go. The chaincode itself
// also rejects an empty reason; this decorator just fails fast at the
// HTTP layer with a clearer message instead of a round trip to Fabric.
export class RevokeCertificateDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
