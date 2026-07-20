// Mirrors chaincode/certificate-cc/model.go's Certificate struct
// exactly - nothing added, nothing renamed.
export class CertificateDto {
  certificateId!: string;
  consortiumNumber!: number;
  issuerSequenceNumber!: number;
  holderName!: string;
  holderDetails!: string;
  metadata?: Record<string, unknown>;
  certificateHash!: string;
  issuerId!: string;
  issuedAt!: string;
  status!: string; // active | revoked
  revokedAt?: string;
  revokedReason?: string;
  docType!: string;
}
