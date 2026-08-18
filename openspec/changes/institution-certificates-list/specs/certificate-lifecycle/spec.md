## MODIFIED Requirements

### Requirement: List an institution's certificates
Any caller SHALL be able to list every certificate issued by a given institution, via `GET /institutions/:institutionId/certificates` or the corresponding institution detail page in the UI, for any institution, not only the caller's own.

#### Scenario: Certificates listed most-recent-first
- **WHEN** an institution has issued one or more certificates
- **THEN** they are returned/shown ordered most-recent-first

#### Scenario: An institution's detail page shows its own certificate list, for any institution
- **WHEN** a caller views another institution's detail page
- **THEN** the page shows that institution's issued certificates, not an empty or "not available" state, and does not offer an action to issue a certificate on that institution's behalf

#### Scenario: No certificates issued yet
- **WHEN** a caller views an institution's detail page and that institution has issued no certificates
- **THEN** the page shows a clear "no certificates issued yet" state rather than an empty table or an error

**Known gap, not yet a requirement above:** this query has no pagination
(`context/codebase/CONCERNS.md`'s watch-list entry) — an institution with a
large certificate history pays a full-scan-and-sort cost on every call. Not
written as a requirement here since it describes an absence, not a
specified behavior; flagging so a real reconstruction pass decides whether
to spec pagination as required behavior or leave it as a known limitation.
