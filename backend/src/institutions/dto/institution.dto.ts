// Mirrors chaincode/institution-cc/model.go's Institution struct.
// status is only ever observed as "active" - RegisterInstitution and
// CastVote's applicant-creation path both set institutionStatusActive
// unconditionally; there is no other value any function ever writes.
export class InstitutionDto {
  institutionId!: string;
  name!: string;
  status!: string;
  type!: string; // founding | approved
  joinedAt!: string;
  approvedBy?: string[]; // present for type: "approved"; absent for "founding"
  docType!: string;
}
