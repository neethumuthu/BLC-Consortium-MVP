---
last_verified: 2026-08-13
source: code-derived, human-reviewed
confidence: high
owner: Neethu Muthu, reviewed 2026-08-13
---

# Certificate Lifecycle Specification

## Purpose

Lets an active institution issue, look up, verify, and revoke certificates
through `certificate-cc` and `backend/src/certificates/`. This capability
predates the project's adoption of OpenSpec (see
`context/codebase/TESTING.md`'s existing note on this) and has real, working
behavior in production — it was simply never spec'd.

**Originally a code-derived stub, since reviewed against real behavior**
(Neethu Muthu, 2026-08-13 — every requirement below checked live against
running certificate-cc/backend behavior, both directly and via the
frontend). What blocked doing this properly up front (a human, ideally
whoever does QA on certificates, reviewing reality against a draft — the
same way `institution-governance-ui` and `credential-rotation` were built)
was that there was no real next-quarter capability backlog to select 3-6
areas from yet (`context/product/` didn't exist at the time this was
written) — that review has now happened solo instead, and held up with no
corrections needed. This was originally written for a
different reason — an earlier, incorrect belief that OpenSpec's own
`/opsx:onboard` tool for this step was missing from the CLI. That was wrong
(see `.claude/skills/spec-onboard-replacement/SKILL.md`'s own correction
note); `/opsx:onboard` exists once a custom workflow profile is enabled, it
just does something different (a single-task guided tutorial) than a bulk
capability sweep. Every requirement below is written directly from reading
`chaincode/certificate-cc/*.go` and
`backend/src/certificates/certificates.controller.ts` — confirm it holds up
before raising `confidence` above `low`.

## Requirements

### Requirement: Issue a certificate
An active institution SHALL be able to issue a certificate on its own
authority, via `POST /certificates`, without requiring any other
institution's chaincode-level approval.

#### Scenario: Successful issuance
- **WHEN** an active institution issues a certificate with holder name,
  holder details, and metadata
- **THEN** the certificate is created with a content hash, status `VALID`,
  and a deterministic ID (the transaction ID, not a UUID)

### Requirement: Look up a certificate
Any caller SHALL be able to fetch a certificate by ID, via
`GET /certificates/:certificateId` — this is a read-only query with no
institution-membership restriction, matching `institution-cc`'s own
query-function convention.

#### Scenario: Certificate exists
- **WHEN** a caller requests an existing certificate's ID
- **THEN** the full certificate record is returned

#### Scenario: Certificate does not exist
- **WHEN** a caller requests a certificate ID with no matching record
- **THEN** the request is rejected rather than returning an empty or null result

### Requirement: Verify a certificate
Any caller SHALL be able to verify a certificate via
`GET /certificates/:certificateId/verification`, which checks data
integrity before checking revocation status.

#### Scenario: Valid certificate
- **WHEN** a certificate's recomputed content hash matches its stored hash,
  and it has not been revoked
- **THEN** verification reports `VALID`

#### Scenario: Tampered certificate takes priority over revoked
- **WHEN** a certificate's recomputed content hash does not match its
  stored hash, regardless of its revocation status
- **THEN** verification reports `TAMPERED`, not `REVOKED`

#### Scenario: Revoked certificate
- **WHEN** a certificate's content hash is intact but its status is revoked
- **THEN** verification reports `REVOKED`

### Requirement: Revoke a certificate
Only the certificate's original issuing institution SHALL be able to revoke
it, via `POST /certificates/:certificateId/revoke` — no other institution,
and no governance vote, regardless of whether the issuer is still an active
institution at the time of revocation.

#### Scenario: Issuer revokes successfully
- **WHEN** the calling institution is the certificate's original issuer,
  the certificate is not already revoked, and a non-empty reason is given
- **THEN** the certificate's status becomes `REVOKED`, with the reason and
  revocation timestamp recorded

#### Scenario: Non-issuer is rejected
- **WHEN** the calling institution is not the certificate's original issuer
- **THEN** the revocation is rejected with a 403, regardless of the
  institution's own active/inactive status

#### Scenario: Already-revoked certificate is rejected
- **WHEN** a revoke is attempted on a certificate whose status is already
  `REVOKED`
- **THEN** the request is rejected with a 409 rather than silently
  succeeding again

### Requirement: List an institution's certificates
Any caller SHALL be able to list every certificate issued by a given
institution, via `GET /institutions/:institutionId/certificates`.

#### Scenario: Certificates listed most-recent-first
- **WHEN** an institution has issued one or more certificates
- **THEN** they are returned ordered most-recent-first

**Known gap, not yet a requirement above:** this query has no pagination
(`context/codebase/CONCERNS.md`'s watch-list entry) — an institution with a
large certificate history pays a full-scan-and-sort cost on every call. Not
written as a requirement here since it describes an absence, not a
specified behavior; flagging so a real reconstruction pass decides whether
to spec pagination as required behavior or leave it as a known limitation.
