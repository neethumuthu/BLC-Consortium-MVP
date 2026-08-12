---
last_verified: 2026-08-12
source: code-derived, unreviewed
confidence: low
owner: unassigned — needs a human review pass before this confidence bumps
---

# Institution Directory Specification

## Purpose

Lets any caller list every institution in the consortium, or look up one by
its MSP ID, via `institution-cc`'s `GetAllInstitutions`/`GetInstitution` and
`backend/src/institutions/institutions.controller.ts`. Real, shipped,
API-reachable behavior that predates this project's adoption of OpenSpec —
`institution-governance-ui`'s spec covers proposing/voting on membership,
not the plain directory lookup this spec covers.

**This is a code-derived stub, not a reconstructed spec** — same reason as
`certificate-lifecycle`'s: no real next-quarter capability backlog exists
yet to select from. (This was originally attributed to `/opsx:onboard`
being missing from the CLI — that was wrong; see
`.claude/skills/spec-onboard-replacement/SKILL.md`'s correction note.
`/opsx:onboard` exists once a custom workflow profile is enabled, but it's a
single-task guided tutorial, not a bulk capability sweep — a different tool
than what generated this stub.) Confirm this holds up before raising
`confidence` above `low`.

## Requirements

### Requirement: List every institution
Any caller SHALL be able to list every institution on the ledger, via
`GET /institutions`, regardless of that institution's status.

#### Scenario: Institutions listed
- **WHEN** one or more institutions exist on the ledger (any status)
- **THEN** every one of them is returned, not only active ones

**Known gap, not yet a requirement above:** `GET /institutions` has no
pagination (`context/codebase/CONVENTIONS.md`'s "No pagination anywhere"
note) — the full unpaginated array is returned on every call, same
category of gap as `certificate-lifecycle`'s analogous list endpoint. Not
written as a requirement since it describes an absence, not a specified
behavior; flagging so a real reconstruction pass decides whether to spec
pagination as required or leave it as a known limitation.

### Requirement: Look up a single institution
Any caller SHALL be able to fetch a single institution by its MSP ID, via
`GET /institutions/:institutionId`.

#### Scenario: Institution exists
- **WHEN** a caller requests an existing institution's MSP ID
- **THEN** the full institution record is returned

#### Scenario: Institution does not exist
- **WHEN** a caller requests an MSP ID with no matching institution record
- **THEN** the request is rejected rather than returning an empty or null
  result

**Known gap, not yet a requirement above:** `RegisterInstitution` — the
chaincode function that actually creates a founding institution's ledger
record — has no HTTP route at all (checked directly:
`institutions.controller.ts` has no route calling it). It is bootstrap-CLI-only,
invoked by hand during network setup, never through the ongoing product
surface. Deliberately not spec'd here, or anywhere, on the same basis
`org-add.sh` isn't — this is infra/bootstrap behavior, not a product
capability an institution's operator ever triggers themselves.
