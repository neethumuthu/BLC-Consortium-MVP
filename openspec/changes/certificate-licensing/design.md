## Context

See `proposal.md` for motivation. Confirmed against current source before
writing this: `chaincode/certificate-cc`'s `Certificate.IssuerID` is always
the caller's own MSP ID (`IssueCertificate`, `chaincode/certificate-cc/issuecertificate.go`)
— there is no existing "issued on behalf of" or brand-licensing concept.
`chaincode/institution-cc/model.go`'s `Institution.Type` comment lists
`founding | approved | partner`, but only `institutionTypeFounding` and
`institutionTypeApproved` are ever defined or assigned — `partner` is an
anticipated, never-implemented value, not a hidden existing feature this
change would be duplicating.

## Goals / Non-Goals

**Goals:**
- Let a licensor institution grant a partner institution the right to
  issue certificates that visibly carry both the partner's own identity
  and the licensor's brand ("official partner of `<institution>`").
- Make a partner-issued certificate distinguishable from the licensor's
  own direct issuances, both in stored data and in verification output.

**Non-Goals:**
- Resolving whether partner vetting is required (Open Question 1, below) —
  this design does not assume an answer either way.
- Resolving the 66%-threshold timing question (Open Question 2, below) —
  raised in the same source notes, but it's about the existing governance
  threshold (`requiredVotesToApprove`), not licensing specifically. Not
  this change's decision to make; carried forward for visibility only.
- A partner sub-licensing to a further partner (multi-level licensing) —
  not mentioned in the source notes; out of scope unless raised later.

## Decisions

Deliberately deferred — see Open Questions. No chaincode data model,
authorization check, or chaincode function signature is decided in this
pass, because the shape of the licensing relationship depends directly on
Open Question 1's answer (an unvetted licensing grant is a simpler
data/authorization model than a vetted one requiring a second institution's
sign-off, closer to `CastVote`'s existing shape). Deciding the data model
before that question resolves risks designing the wrong shape and
redoing it.

## Risks / Trade-offs

- [Risk] Writing `specs.md` before Open Question 1 resolves could lock in
  requirements that don't match the eventual decision → [Mitigation]
  `specs.md` for this change covers only what's true under both answers
  (a licensing grant exists, a partner-issued certificate is distinct from
  a direct one) and explicitly excludes the vetting mechanism itself as a
  requirement until decided.
- [Risk] Treating "partner" (the unused `Institution.Type` value) as
  license to build this loosely, without confirming no other latent
  assumption exists around it → [Mitigation] confirmed directly (Context,
  above) that it's genuinely unused, not a partially-built feature.

## Open Questions

**1. Does a partnering institution need vetting before it can license a
certificate brand?** From the source planning notes, verbatim options
raised, no decision made:
- Yes — vetted by more than one node (the notes' own example: a
  medical-degree certificate vetted by a second body, e.g. a "European
  Council Education Commission"-style institution).
- Not required at the first stage (current two-to-three institution
  scale).
- A different specific second-vetter mechanism, unspecified in the notes.

This changes the actual chaincode shape (whether licensing needs a
`CastVote`-style approval flow, or is a unilateral grant by the licensor)
and therefore blocks writing real Requirements/Scenarios for the vetting
mechanism in `specs.md`. Needs a decision from whoever owns this roadmap
(the notes mention Szymon formalizing a related question) before
implementation, matching how `password-change`'s scope ambiguity was
resolved directly with the PO rather than guessed.

**2. Should the existing 66%-of-institutions-agree governance threshold be
decided/locked now, or deferred until the network scales past two-to-three
institutions?** Not this change's question to resolve — it's about
`requiredVotesToApprove` (`chaincode/institution-cc/governance.go`), an
already-shipped mechanism unrelated to certificate licensing specifically.
Recorded here only because the source notes raised it in the same breath,
and because whichever way Question 1 resolves (if vetting requires a
vote), the two questions could turn out to be linked. Not a blocker for
this change's own artifacts.
