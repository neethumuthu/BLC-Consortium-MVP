import "server-only";
import { INSTITUTIONS, displayNameFor } from "./institutions";

// Rewrites raw backend/chaincode error text (see
// backend/src/common/filters/fabric-exception.filter.ts and the Go
// fmt.Errorf strings it forwards) into plain language, and replaces any
// raw MSP ID with its display name as a safety net for patterns not
// explicitly matched below.
export function humanizeBackendError(rawMessage: string): string {
  const message = rawMessage.trim();

  if (/certificate .* does not exist/.test(message)) {
    return "We couldn't find a certificate with that ID. Double-check the ID and try again.";
  }
  if (/is not the issuer of certificate/.test(message)) {
    return "This certificate wasn't issued by your institution, so it can't be revoked here.";
  }
  if (/certificate .* is already revoked/.test(message)) {
    return "This certificate has already been revoked.";
  }
  if (/revocation reason must not be empty/.test(message)) {
    return "Please provide a reason for the revocation.";
  }
  if (/institution .* does not exist/.test(message)) {
    return "We couldn't find that institution.";
  }
  if (/is not an active institution|is not a registered institution/.test(message)) {
    return "That institution isn't an active member of the consortium.";
  }
  if (/proposal .* does not exist/.test(message)) {
    return "We couldn't find a proposal with that ID.";
  }
  if (/is already a member institution/.test(message)) {
    return "That institution is already a member of the consortium.";
  }
  if (/open or already-approved membership proposal exists/.test(message)) {
    return "There's already an open or approved proposal for that institution.";
  }
  if (/is the applicant and cannot vote on its own proposal/.test(message)) {
    return "You can't vote on your own membership proposal.";
  }
  if (/has already voted on proposal/.test(message)) {
    return "You've already voted on this proposal.";
  }
  if (/is not open \(status:/.test(message)) {
    return "This proposal is no longer open for voting.";
  }

  return withDisplayNames(message);
}

function withDisplayNames(message: string): string {
  let result = message;
  for (const institution of INSTITUTIONS) {
    result = result.split(institution.institutionId).join(displayNameFor(institution.institutionId));
  }
  return result;
}
