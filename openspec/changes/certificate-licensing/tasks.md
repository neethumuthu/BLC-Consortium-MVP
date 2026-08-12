## 1. Resolve the blocking open question

- [ ] 1.1 Get a decision on Open Question 1 (`design.md`) — does licensing a
  certificate brand to a partner require vetting, and if so by whom?
  Blocks every implementation task below; do not guess an answer to
  unblock this.
- [ ] 1.2 Once 1.1 resolves, update `design.md`'s Decisions section with
  the actual chosen data model/authorization shape (a `CastVote`-style
  approval flow if vetting is required, or a simpler unilateral grant if
  not) before starting implementation tasks.

## 2. Chaincode (institution-cc) — licensing relationship

- [ ] 2.1 Model the licensing relationship (licensor MSP, partner MSP,
  active/inactive) — exact shape depends on 1.2's resolved decision.
- [ ] 2.2 Implement the grant mechanism decided in 1.2.
- [ ] 2.3 Add a query to check whether a given partner holds an active
  license from a given licensor (needed by task 3.1 below regardless of
  1.1's answer).

## 3. Chaincode (certificate-cc) — licensed issuance

- [ ] 3.1 Implement partner-issued certificate creation: reject if no
  active license exists (task 2.3's query), otherwise record both partner
  and licensor identity on the resulting certificate — matches this
  change's one already-written requirement regardless of how 1.1
  resolves.
- [ ] 3.2 Confirm `VerifyCertificate`/`GetCertificate` surface the
  partner/licensor distinction correctly for a partner-issued certificate.

## 4. Backend + frontend

- [ ] 4.1 Expose the licensing relationship and licensed-issuance routes
  once chaincode (sections 2-3) is real.
- [ ] 4.2 Surface the partner/licensor distinction in the UI wherever
  certificates are listed or verified.

## 5. Verify and archive

- [ ] 5.1 Live-verify both spec scenarios against a real running network.
- [ ] 5.2 Sync the delta spec into `openspec/specs/certificate-licensing/spec.md`
  (a new main spec — this change introduces the capability, so its
  `## Purpose` carries forward at archive).
- [ ] 5.3 Archive this change.

**Sections 2-5 are blocked on section 1 and are not started** — this
change is proposal/design/specs only for now, per explicit instruction.
