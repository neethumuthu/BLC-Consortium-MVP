## Purpose

Lets an institution license its certificate brand to a partner
institution, so the partner can issue certificates under its own name with
an "official partner of `<institution>`" designation, distinguishable from
the licensor's own direct issuances.

**Deliberately minimal for now.** The actual licensing-grant mechanism
(whether it requires vetting, and by whom) is a genuine open question in
`design.md`, not decided — see Open Question 1 there. Writing a
grant-mechanism requirement here would mean guessing an answer. Only the
one requirement below, which holds true regardless of how Question 1
resolves, is written. Everything else (granting a license, revoking one,
any vetting/approval flow) is intentionally absent from this delta until
that question is answered — this is not an oversight.

## ADDED Requirements

### Requirement: A partner-issued certificate is visibly distinct from a directly-issued one
Any certificate issued under a licensed brand designation SHALL name both
the issuing partner institution and the licensor whose brand it was issued
under, and SHALL NOT be issuable without an active license from that
licensor — regardless of how that license came to exist.

#### Scenario: Partner issues under an active license
- **WHEN** a partner institution with an active license from a licensor
  issues a certificate under that licensed designation
- **THEN** the resulting certificate names both the partner (as issuer of
  record) and the licensor (as the brand licensed), visibly distinct from
  a certificate the licensor issued directly under its own name

#### Scenario: Issuance without an active license is rejected
- **WHEN** an institution attempts to issue a certificate under a licensed
  brand designation for a licensor it does not hold an active license
  from
- **THEN** the issuance is rejected, regardless of what mechanism would
  otherwise be used to grant such a license
