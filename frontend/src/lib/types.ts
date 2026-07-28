// Mirrors backend/src/certificates/dto/certificate.dto.ts exactly.
export interface Certificate {
  certificateId: string;
  consortiumNumber: number;
  issuerSequenceNumber: number;
  holderName: string;
  holderDetails: string;
  metadata?: Record<string, unknown>;
  certificateHash: string;
  issuerId: string;
  issuedAt: string;
  status: "active" | "revoked";
  revokedAt?: string;
  revokedReason?: string;
  docType: string;
}

// Mirrors backend/src/certificates/dto/verification-result.dto.ts exactly.
export interface VerificationResult {
  status: "VALID" | "TAMPERED" | "REVOKED";
  certificate: Certificate;
}

// Mirrors backend/src/institutions/dto/institution.dto.ts exactly.
export interface Institution {
  institutionId: string;
  name: string;
  status: string;
  type: "founding" | "approved";
  joinedAt: string;
  approvedBy?: string[];
  docType: string;
}
