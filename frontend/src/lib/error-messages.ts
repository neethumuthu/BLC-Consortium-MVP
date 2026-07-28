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

  return withDisplayNames(message);
}

function withDisplayNames(message: string): string {
  let result = message;
  for (const institution of INSTITUTIONS) {
    result = result.split(institution.institutionId).join(displayNameFor(institution.institutionId));
  }
  return result;
}
