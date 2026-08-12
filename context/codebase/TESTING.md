---
last_verified: 2026-08-12
source: code-derived
confidence: medium
owner: QA engineer
---

# Testing

## How to run

```bash
# Go chaincode unit tests — real, passing, hand-written. Confirmed by
# actually running these two commands during this audit:
cd chaincode/certificate-cc && go test ./...   # ok — chaincode/certificate-cc
cd chaincode/institution-cc && go test ./...   # ok — chaincode/institution-cc

# network/ Go module — one package has real tests, two have none:
cd network && go test ./...
#   ok      blc/network/internal/config          (network/internal/config/validate_test.go)
#   ?       blc/network/cmd/blcgen      [no test files]
#   ?       blc/network/internal/generate [no test files]

# Backend (NestJS) — DO NOT run this expecting real coverage:
cd backend && npm run test    # runs `jest`, per backend/package.json's "test" script —
                               # but there is no jest.config.*, no "jest" key in
                               # package.json, and zero *.spec.ts/*.test.ts files
                               # anywhere under backend/src. jest is installed
                               # (jest, ts-jest, supertest, @nestjs/testing are all
                               # in package.json devDependencies) but never wired up.

# Frontend (Next.js) — no test command exists at all:
# frontend/package.json scripts are only: dev, build, start, lint.
# No test framework (Jest/Vitest/Playwright/etc.) is installed or configured.
```

## Strategy

Honest inventory of what actually exists, by layer — there is no test pyramid here, and no single unified strategy:

| Layer | What exists | Written by | Runs automatically? |
|---|---|---|---|
| `chaincode/certificate-cc` | Real unit tests: `issuecertificate_test.go`, `revokecertificate_test.go`, `getcertificate_test.go`, `getcertificatesbyinstitution_test.go`, `verifycertificate_test.go`, plus a shared hand-rolled fake ledger/stub in `mocks_test.go` (no mocking library — a custom `fakeLedger`/`fakeStub` implementing `shim.ChaincodeStubInterface`, with real MVCC read/version conflict simulation) | (git history not examined) | No CI found — see below |
| `chaincode/institution-cc` | Real unit tests: `castvote_test.go`, `initledger_test.go`, `proposenewmember_test.go`, `registerinstitution_test.go`, `queries_test.go`, own `mocks_test.go` | (git history not examined) | No CI found — see below |
| `network/internal/config` | One real test file, `validate_test.go`, covering `Validate()` | (git history not examined) | No CI found — see below |
| `network/cmd/blcgen`, `network/internal/generate` | No test files | — | — |
| `backend/src` (NestJS) | Zero test files. Test tooling (jest, ts-jest, supertest, `@nestjs/testing`) is present in `package.json` but unconfigured — no `jest.config.*`, no `jest` block in `package.json`. `npm run test` would currently fail to find any tests to run. | — | — |
| `frontend/src` (Next.js) | Zero test files, zero test tooling installed. `package.json` scripts are `dev`/`build`/`start`/`lint` only. | — | — |

This is a **unit-test-only** picture, confined entirely to the two Go chaincodes and one small Go config package. There is no integration test (nothing spins up a real Fabric network, CouchDB, or the NestJS app in-process against it), no end-to-end test, and no frontend test of any kind (unit, component, or e2e/Playwright).

## Rules

Only rules with actual evidence in the repo are listed. Everything else is explicitly "no enforced rule found":

- **No enforced rule found requiring tests for new backend or frontend code** — there is no CI configuration anywhere in this repository (searched for `.github/workflows` at the repo root; none exists — the only workflow YAML files in the whole checkout live under `AI SDLC/starter-kit/.github/workflows/`, which is an unrelated template/framework directory, not this project's own CI).
- **No enforced rule found for a required test-coverage threshold** — no coverage tool config (e.g. `jest.config` coverage thresholds, `nyc`, codecov config) exists for backend or frontend.
- **Go chaincode tests do follow one consistent, real pattern**, evidenced by reading the test files directly: each package tests via its own package-internal fake ledger (not an external mocking framework), constructs a transaction context per test with `newTx(ledger, txID, callerMSP, timestamp, stubResponder)`, and asserts on both the function's direct return value and, in several tests, a follow-up read-back through the corresponding `Get*` query to confirm the write was actually committed correctly (not just that the function returned the right in-memory value) — e.g. `TestIssueCertificate_Success` in `chaincode/certificate-cc/issuecertificate_test.go` calls `sc.GetCertificate` after `sc.IssueCertificate` to verify readback.
- **No enforced rule found for what to mock vs. not** in the two layers that do have any test infrastructure at all — the Go chaincode tests fake the whole Fabric stub/ledger rather than mocking individual calls; there is no equivalent guidance visible for backend, since it has no tests to derive a convention from.
- **ESLint exists and is configured for both backend (`eslint "{src,test}/**/*.ts"`) and frontend (`eslint-config-next`'s `core-web-vitals` + `typescript` presets, `frontend/eslint.config.mjs`)**, and both `tsconfig.json`s enable `strict`-adjacent options (backend: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`; frontend: `strict: true`). These are real, checkable rules — but they are lint/type rules, not test rules, and there is no CI wiring found that would actually run `npm run lint` or `tsc` automatically on a PR.

## Doc-derived additions

> *(source: doc-derived V1_PHASE_OVERVIEW.md, confidence: medium)*

- **`chaincode/certificate-cc`'s unit test count is confirmed at exactly 22 test functions**: `issuecertificate_test.go` (7) + `getcertificate_test.go` (2) + `getcertificatesbyinstitution_test.go` (2) + `verifycertificate_test.go` (6) + `revokecertificate_test.go` (5) = 22, counted directly (`grep -c "^func Test"` per file). This matches the source doc's "22/22 unit tests" claim for the certificate lifecycle exactly. Both chaincodes together expose 13 exported transaction functions (8 in `institution-cc` — `GetResolvedProposals` added 2026-08-11 — 5 in `certificate-cc`), also confirmed by direct count.

## Ring 3 QA goals

**Update (2026-08-11): `agentic-qa` now logs in as a read-only "QA Guest" account, not BLCFounder.** The first two real runs (2026-08-10, 2026-08-11) each logged in with BLCFounder's real cosmetic-login credentials (readable straight out of `frontend/src/lib/institutions.ts`) and, in the course of executing the goals below literally, completed a real `ProposeNewMember` and enough real `CastVote`s to reach quorum - creating two permanent, fully "active" institutions on the shared staging ledger and changing the consortium's real majority-vote threshold (`requiredVotesToApprove` counts active institutions). See `docs/ERROR_LOG.md`'s 2026-08-11 entry.

Fix: `frontend/src/lib/institutions.ts` now has a `QA_GUEST` account whose requests carry `READ_ONLY_API_KEY` instead of a real institution's `API_KEY` - `ApiKeyGuard` (`backend/src/common/guards/api-key.guard.ts`) accepts that key for `GET` only and rejects every mutating route (propose/vote/issue/revoke/rotate) with 403, before it reaches the chaincode. Every goal below that describes a write action (propose, vote, issue, revoke, rotate) should now be read as: **attempt the action, confirm the backend rejects it with 403 for this read-only caller - that 403 is the expected, correct result here, not a defect to file.** Goals that only read/verify (list proposals, verify a certificate, look up an institution) still exercise real behavior normally. This reframing applies specifically to the automated agent; a human QA engineer testing with a real institution's full-privilege login can still use the original wording (confirm the tally updates, confirm the certificate is issued, etc.) exactly as written below.

**Update (2026-08-10): the first real Ring 3 / goal-driven QA run has now happened, confirmed live, not assumed.** Earlier versions of this section claimed `agentic-qa.yml` "existed under `.github/workflows/` (added 2026-08-05)" — that was wrong; the file only ever existed in the starter-kit template, never actually copied into this repo's real workflows, until 2026-08-10 (see `docs/BUILD_LOG.md`'s Phase 15). Once added, plus a persistent staging environment (`blc31-staging.westeurope.cloudapp.azure.com`), `STAGING_URL`, and `.github/qa-mcp.json`, a manual `workflow_dispatch` run actually drove the real staging UI end-to-end and filed a genuinely well-reasoned issue (#8 — per-institution vote status never shown anywhere in the governance UI, three spec scenarios cited, root cause traced to the actual DTO/chaincode layer, reproduced live with exact steps) — see `docs/ERROR_LOG.md`'s 2026-08-10 entry for the one real bug this run also surfaced (the `qa-agent` label didn't exist yet, now fixed). `SLACK_WEBHOOK_QUALITY` was also incorrectly claimed missing in an earlier pass of this same session — it has existed since 2026-08-07. The goals below are still worth keeping as prepared intents for future runs, but are no longer purely hypothetical — one real pass against them has already happened.

Goals are intents, not scripts — the agent should plan its own concrete paths per goal, including unhappy paths, and is not limited to the scenarios named below.

### Certificate lifecycle (no openspec/specs/ capability exists for this yet — it predates the project's adoption of openspec, so goals here are derived directly from `backend/src/certificates/` behavior, not a cited spec scenario)
- Issue a certificate as an active institution, then verify it — confirm the verification response reflects the certificate's real hash/issuer/status, not a generic success.
- Attempt to revoke a certificate as an institution that did not issue it — confirm it's rejected, not silently permitted.
- Revoke a certificate, then verify it again — confirm the verification result reflects the revoked status, not stale "valid" data.
- Attempt to revoke an already-revoked certificate — confirm a clear rejection, not a duplicate revocation or a raw 500.
- Verify a certificate ID that was never issued — confirm a clean "not found," not a crash or a false-positive "valid."

### Institution governance UI (openspec/specs/institution-governance-ui/spec.md)
- Propose a new member institution as an active institution, then confirm it appears in the open-proposals list with zero votes — per "Successful proposal."
- Attempt to propose an institution that's already an active member — confirm rejection with a clear message, not a generic failure — per "Proposing an already-member institution is rejected."
- Attempt a second proposal for a candidate that already has an open proposal — confirm rejection — per "Duplicate proposal for the same candidate is rejected."
- Cast a vote on an open proposal as an eligible institution, confirm the tally updates — per "Vote is accepted and counted."
- Attempt to vote on your own proposal as the applicant — confirm rejection — per "Applicant cannot vote on its own proposal."
- Vote twice on the same proposal as the same institution — confirm the second attempt is rejected and the row already shows "You voted Yes/No" with no voting control, rather than a generic error — per "Double-voting is rejected."
- Attempt to vote on a proposal that's already Approved or Rejected — confirm the UI shows the proposal's final status rather than offering a voting control — per "Voting on a closed proposal is rejected."
- Load the governance page as an institution that hasn't voted on anything yet — confirm every open proposal is listed with applicant name, tally, and this institution's not-yet-voted state — per "Pending proposals are listed."
- Load the governance page and confirm the "Recently closed" section lists every already-resolved proposal (applicant name, final status, final tally, no voting control) — including one this institution never got to vote on before it resolved — per "View resolved proposals."

### Credential rotation (openspec/specs/credential-rotation/spec.md)
- Change an institution's credential with the correct current value, then confirm the old credential is rejected and the new one works on the very next request — per "Successful credential change."
- Attempt to change a credential with the wrong current value — confirm rejection and that the existing credential still works afterward (nothing partially applied) — per "Wrong current credential is rejected."
- After a successful rotation, exercise a few unrelated existing endpoints (certificate issuance, institution lookup) with the new credential — confirm normal authentication is unaffected, not just the credential-change endpoint itself — per "Normal requests still require the current credential."
- After a successful rotation, retry a request using the old, just-replaced credential — confirm it's rejected the same way any other wrong credential would be — per "Requests with the old, since-replaced credential are rejected."

### Cross-cutting
- Try reaching any authenticated endpoint with no `Authorization` header at all, and with a well-formed but wrong Bearer value — confirm both fail the same way (401), not different error shapes that leak which case occurred.
- Walk every error scenario above and confirm the frontend shows a specific, readable message (via `humanizeBackendError`) rather than a generic failure banner — this project has consistently treated raw backend errors leaking to the UI as a real defect, not a nitpick.
