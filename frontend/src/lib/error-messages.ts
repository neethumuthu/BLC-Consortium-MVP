import "server-only";

// Rewrites raw backend/chaincode error text (see
// backend/src/common/filters/fabric-exception.filter.ts and the Go
// fmt.Errorf strings it forwards) into plain language. Anything not
// explicitly matched below falls back to a fixed generic message (see
// the end of this function) rather than echoing the raw text - see
// issue #21 for why a "safety net" that displayed unmatched text (even
// with MSP-ID substitution) was itself a real defect.
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
  if (/read-only credential/.test(message)) {
    return "This is a read-only account and can't make changes — browsing and lookups still work normally.";
  }

  // Anything not explicitly matched above is unverified, raw backend/
  // framework text (chaincode error, HTTP framework text like "Cannot GET
  // ...", a stack trace, etc.) - TESTING.md's own cross-cutting goal treats
  // any raw backend error reaching the UI as a real defect, not a nitpick,
  // so this must never echo the raw message back, even with display-name
  // substitution (that "safety net" was itself how issue #21's bug leaked
  // through - a not-obviously-wrong-looking string that was still raw).
  return "Something went wrong. Please try again.";
}
