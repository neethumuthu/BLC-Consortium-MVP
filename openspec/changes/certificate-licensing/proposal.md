## Why

Real (informal) planning notes shared 2026-08-12 name certificate licensing
as v1.01's actual next capability, once v1.0's consortium-creation work
(institution onboarding/approval) is done — which it already is. The notes
describe an institution licensing its certificate brand to partner
institutions, who then issue certificates under their own name with an
"official partner of `<institution>`" designation. This is the one item
`context/product/PRODUCT.md`'s "What we are NOT building" section already
flagged as still genuinely unbuilt, unlike the other two items on that
original out-of-scope list (which have since shipped). Confirmed directly
against the current chaincode/backend before writing this: `Certificate`
has a single `IssuerID` field, always the caller's own MSP ID with no
concept of "issued on behalf of" or a licensed brand name;
`Institution.Type`'s own comment lists `partner` as a possible value, but
no code path (`institutionTypeFounding`/`institutionTypeApproved` are the
only defined constants) ever assigns it. This is genuinely new ground, not
something already half-built under a different name.

## What Changes

- New capability: an institution ("the licensor") can grant a partner
  institution the right to issue certificates under a licensed brand
  designation. A partner-issued certificate is visibly distinct from a
  directly-issued one — it names both the partner (as issuer of record)
  and the licensor (as the brand being licensed), rather than looking
  identical to a certificate the licensor issued itself.
- **Two things are genuinely unresolved in the source notes and are NOT
  decided by this proposal** — see Open Questions in `design.md`. This
  proposal scopes the capability's shape; it does not answer either
  question. Do not treat silence on either as a default answer.

## Capabilities

### New Capabilities
- `certificate-licensing`: lets an institution license its certificate
  brand to a partner institution, which can then issue certificates under
  its own name with an "official partner of `<institution>`" designation.

### Modified Capabilities
(none — `certificate-lifecycle`'s existing issue/verify/revoke behavior for
an institution's own certificates is unchanged; this adds a new, additional
capability rather than modifying that one)

## Impact

- New chaincode concept: a licensing relationship between two institutions
  (licensor, partner), and a partner-issued certificate's distinct shape
  (naming both parties). Exact data model is a `design.md` decision, not
  finalized here.
- `chaincode/certificate-cc` — likely a new function or a variant of
  `IssueCertificate` for partner-issued certificates; `chaincode/institution-cc`
  — likely where the licensing relationship itself is recorded, given it's
  institution-to-institution, not certificate-specific.
- No implementation in this pass — proposal/design/specs/tasks only, per
  explicit instruction. Nothing in `chaincode/`, `backend/`, or `frontend/`
  changes as part of this change.
