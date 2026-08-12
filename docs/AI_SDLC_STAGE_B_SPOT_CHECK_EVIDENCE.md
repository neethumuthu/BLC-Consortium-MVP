# AI SDLC Stage B — Spot-Check Verification Record

**Scope:** 20 individually selected, technically meaningful claims, drawn
from all seven generated files, each independently verified by reading or
grepping the real source directly. This is a sample, not exhaustive
coverage of every claim in the seven files.

**Companion document:** `docs/AI_SDLC_STAGE_B_EVALUATION_REPORT.md`. This
record is the evidentiary backing for that report's Accuracy findings.

**Verification date:** 2026-07-29.

---

## Purpose

This document records the manual verification performed after Stage B of
the AI SDLC Framework. The generated documentation was not accepted at
face value; instead, representative technical claims were independently
verified against the BLC-31 source code. The goal is to provide an
auditable record showing that the evaluation report's conclusions are
backed by direct evidence, not by trust in the generating agents'
self-reported citations.

The claims were intentionally selected from all seven generated files and
include architecture, integrations, configuration, testing, conventions,
security, and implementation behaviour, to provide broad coverage across
the generated documentation rather than concentrating on any one area.

This verification is a representative engineering sample rather than a
line-by-line audit of every generated statement. The objective was to
evaluate whether the framework consistently produced technically correct
observations across different areas of the codebase — not to certify every
individual sentence in the seven generated files.

---

## Sample distribution

| Category | Claims |
| --- | --- |
| Stack / Configuration | 3 |
| Integrations | 3 |
| Architecture | 3 |
| Coding Conventions | 3 |
| Testing | 3 |
| Concerns / Risks | 3 |
| Structure | 2 |
| **Total** | **20** |

---

## STACK.md

| Field                         | SC-01                                                                                                                                                                                                                         | SC-02                                                                                                                               | SC-03                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**               | `network/config/network.yaml` declares `chaincode: packaging: classic`, but the actual deployed system runs `ccaas` (chaincode-as-a-service) throughout                                                                 | All three Go modules in the repo (`network/`, `chaincode/certificate-cc/`, `chaincode/institution-cc/`) declare `go 1.25.0` | CouchDB 3.3 is confirmed as the Fabric state database, with`admin`/`adminpw` hardcoded as its admin credentials                                                                                                                         |
| **Source(s) inspected** | `network/config/network.yaml`; `chaincode/certificate-cc/main.go`; `chaincode/institution-cc/main.go`                                                                                                                   | `network/go.mod`; `chaincode/certificate-cc/go.mod`; `chaincode/institution-cc/go.mod`                                        | `network/generated/docker-compose-net.yaml`; `network/deployment/local.yaml`                                                                                                                                                            |
| **Method**              | Direct read of the config field; grep for ccaas markers (`ChaincodeServer`, `CHAINCODE_ID`, `CHAINCODE_SERVER_ADDRESS`) in both chaincode entry points                                                                  | `grep -n "^go "` on all three `go.mod` files                                                                                    | Direct read of the generated compose file and the deployment config                                                                                                                                                                         |
| **Result**              | **Confirmed**                                                                                                                                                                                                           | **Confirmed**                                                                                                                 | **Confirmed**                                                                                                                                                                                                                         |
| **Evidence**            | `network.yaml:27` → `packaging: classic`; both `main.go` files construct a `shim.ChaincodeServer` and read `CHAINCODE_ID`/`CHAINCODE_SERVER_ADDRESS` from the environment — no classic-builder code path exists | All three files:`go 1.25.0`                                                                                                       | `docker-compose-net.yaml`: `image: couchdb:3.3`, `COUCHDB_USER=admin`, `COUCHDB_PASSWORD=adminpw` (appears twice, once per peer's sidecar); `local.yaml:3-4`: `couchdb_admin_user: admin` / `couchdb_admin_password: adminpw` |
| **Notes**               | Genuine, unresolved discrepancy between declared config and actual runtime behavior — flagged in`STACK.md`'s own "Ambiguities" section, not silently resolved                                                              | —                                                                                                                                  | Credentials are a local-dev placeholder; the fact of their being hardcoded is independently corroborated in`CONCERNS.md`'s known-debt table                                                                                               |

---

## INTEGRATIONS.md

| Field                         | SC-04                                                                                                                                                                           | SC-05                                                                                         | SC-06                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**               | The backend connects to the Fabric network via`@hyperledger/fabric-gateway`'s `connect()` function, over gRPC                                                               | Both chaincode services explicitly disable TLS on the peer↔chaincode-server hop              | Every backend route requires`Authorization: Bearer <API_KEY>`, enforced by a single global guard                                   |
| **Source(s) inspected** | `backend/src/fabric-gateway/fabric-gateway.service.ts`                                                                                                                        | `chaincode/certificate-cc/main.go`; `chaincode/institution-cc/main.go`                    | `backend/src/main.ts`                                                                                                              |
| **Method**              | Direct read of the import statement and connection setup                                                                                                                        | Direct read of the`ChaincodeServer` construction in both files                              | Direct read of guard registration                                                                                                    |
| **Result**              | **Confirmed**                                                                                                                                                             | **Confirmed**                                                                           | **Confirmed**                                                                                                                  |
| **Evidence**            | `import { connect, Contract, Gateway, Identity, signers } from '@hyperledger/fabric-gateway';` and `this.gateway = connect({ client: this.grpcClient, identity, signer });` | Both files:`TLSProps: shim.TLSProperties{ Disabled: true }`                                 | `app.useGlobalGuards(app.get(ApiKeyGuard));`, with an inline comment cross-referencing the root `ARCHITECTURE.md`'s decision log |
| **Notes**               | Modern SDK, not the legacy`fabric-network` package                                                                                                                            | Matches the project's own documented MVP-scope rationale (private Docker bridge network only) | —                                                                                                                                   |

---

## ARCHITECTURE.md

| Field                         | SC-07                                                                                                                                                                                                      | SC-08                                                                                                                                                                                                                                   | SC-09                                                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**               | The cross-chaincode relationship is one-directional:`certificate-cc` calls into `institution-cc`, never the reverse                                                                                    | On vote approval,`CastVote` creates the applicant's `Institution` ledger asset directly, in the same transaction — the applicant never calls `RegisterInstitution` itself                                                        | `RevokeCertificate` deliberately omits the active-institution check that `IssueCertificate` enforces                                                                                                                                        |
| **Source(s) inspected** | `chaincode/institution-cc/*.go` (all non-test files); `chaincode/certificate-cc/issuecertificate.go`                                                                                                   | `chaincode/institution-cc/governance.go`                                                                                                                                                                                              | `chaincode/certificate-cc/revokecertificate.go`                                                                                                                                                                                               |
| **Method**              | Grep for`certificate-cc`/`InvokeChaincode` inside `institution-cc`; grep for `InvokeChaincode` inside `certificate-cc`                                                                           | Read the approval branch of`CastVote` directly                                                                                                                                                                                        | Read the function and its doc comment directly                                                                                                                                                                                                  |
| **Result**              | **Confirmed**                                                                                                                                                                                        | **Confirmed**                                                                                                                                                                                                                     | **Confirmed**                                                                                                                                                                                                                             |
| **Evidence**            | No reference to`certificate-cc` or `InvokeChaincode` found anywhere in `institution-cc`'s non-test source; `issuecertificate.go:37` calls `ctx.GetStub().InvokeChaincode("institution-cc", ...)` | On`proposal.VotesFor >= requiredVotesToApprove(...)`, the code constructs an `Institution{...}` literal and calls `putInstitution(ctx, applicant)` directly — no separate `RegisterInstitution` invocation exists in that path | Function only checks`certificate.IssuerID != callerMSP`; its own doc comment states explicitly: "Unlike IssueCertificate, this does NOT call requireActiveInstitution... the authorization check here is narrower and stricter... not weaker" |
| **Notes**               | —                                                                                                                                                                                                         | —                                                                                                                                                                                                                                      | Asymmetry is intentional and documented in-code, per the comment's own reasoning                                                                                                                                                                |

---

## CONVENTIONS.md

| Field                         | SC-10                                                                                                                                                   | SC-11                                                                                                                                                                                                                      | SC-12                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**               | Import quote style is a hard split by codebase area: all backend`.ts` files use single quotes; most frontend `.ts`/`.tsx` files use double quotes | Chaincode never calls`time.Now()`; timestamps always go through a `txTimestamp(ctx)` helper for multi-peer endorsement determinism                                                                                     | Every optional chaincode struct field pairs Go's`json:"...,omitempty"` tag with `metadata:"...,optional"`                                                          |
| **Source(s) inspected** | `backend/src/**/*.ts`; `frontend/src/**/*.{ts,tsx}`                                                                                                 | `chaincode/certificate-cc/issuecertificate.go`; `chaincode/institution-cc/governance.go`; all `*_test.go` files in both packages                                                                                     | `chaincode/certificate-cc/model.go`                                                                                                                                  |
| **Method**              | `grep -rlP` counting single- vs. double-quoted `import ... from` lines on each side                                                                 | Grep for`time.Now()` and for the `txTimestamp` function definition, across both production and test files                                                                                                              | Direct read of struct field tags                                                                                                                                       |
| **Result**              | **Confirmed**                                                                                                                                     | **Confirmed** (see Exceptions below)                                                                                                                                                                                 | **Confirmed**                                                                                                                                                    |
| **Evidence**            | 19 of 19 backend`.ts` files single-quoted; 32 of 36 frontend files double-quoted (remaining 4 have no import to sample)                               | `issuecertificate.go:107`: comment "must never use `time.Now()`"; `func txTimestamp(...)` defined independently in both chaincode packages; zero `time.Now()` calls in any production (`_test.go`-excluded) file | `Metadata` (`json:"metadata,omitempty" metadata:"metadata,optional"`), `RevokedAt`, `RevokedReason` — all three carry both tags together, no exceptions found |
| **Notes**               | Two internally-consistent tool defaults, not an unresolved inconsistency within one area                                                                | See**Exceptions** section below — the claim is accurate for production logic but is stated without a caveat that test files call `time.Now()` extensively                                                         | Matches a real, independently-confirmed historical incident (see companion evaluation report's existing-documentation comparison findings)                                                             |

---

## TESTING.md

| Field                         | SC-13                                                                                                                                                                                                                           | SC-14                                                                                                                                                          | SC-15                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Claim**               | The backend has test tooling installed but zero test files and no Jest configuration —`npm run test` would find nothing to run                                                                                               | Both Go chaincodes have real, dedicated unit test files                                                                                                        | No CI configuration exists anywhere in this project's own repository                                                 |
| **Source(s) inspected** | `backend/package.json`; `backend/src/` (recursive)                                                                                                                                                                          | `chaincode/certificate-cc/`; `chaincode/institution-cc/`                                                                                                   | Repository root                                                                                                      |
| **Method**              | Search for`jest.config.*` and any `*.spec.ts`/`*.test.ts` file; read `package.json`'s `devDependencies`/scripts                                                                                                       | `find ... -name "*_test.go"`                                                                                                                                 | Check for`.github/workflows` at repo root                                                                          |
| **Result**              | **Confirmed**                                                                                                                                                                                                             | **Confirmed**                                                                                                                                            | **Confirmed**                                                                                                  |
| **Evidence**            | No`jest.config.*` found; zero `*.spec.ts`/`*.test.ts` files under `backend/src`; `package.json` lists `"test": "jest"` and `jest`/`ts-jest`/`supertest`/`@nestjs/testing` as devDependencies with no wiring | 12 test files found across both packages (`mocks_test.go`, `castvote_test.go`, `issuecertificate_test.go`, `revokecertificate_test.go`, and others)    | `.github` directory does not exist at the repository root                                                          |
| **Notes**               | Test infrastructure is present but never connected — a real, checkable gap, not an assumption                                                                                                                                  | This evaluation confirmed the test*files* exist; it did not independently re-execute `go test` (see companion evaluation report's methodology section, under "known residual gaps") | The only`.github/workflows` files in the checkout belong to the unrelated `AI SDLC/starter-kit/` template folder |

---

## CONCERNS.md

| Field                         | SC-16                                                                                                                                                                          | SC-17                                                                                                                                                                                                                                                                                 | SC-18                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**               | `network.sh`'s `cmd_wipe` unconditionally deletes all crypto material via a throwaway container, with no check for whether any org's identity is already channel-committed | A doc comment in`governance.go` claims `CastVote` never sets a proposal's status to "rejected" — but the function actually does, under a specific condition                                                                                                                      | Every peer container bind-mounts the host's Docker socket                                                                                                        |
| **Source(s) inspected** | `network/scripts/network.sh`                                                                                                                                                 | `chaincode/institution-cc/governance.go` (two separate locations)                                                                                                                                                                                                                   | `docker/peer-base.yaml`; `network/scripts/org-add.sh`                                                                                                        |
| **Method**              | Grep for`cmd_wipe` and `rm -rf`; read the function body                                                                                                                    | Read both the comment and the actual rejection branch                                                                                                                                                                                                                                 | Grep for`docker.sock` across both files                                                                                                                        |
| **Result**              | **Confirmed**                                                                                                                                                            | **Confirmed**                                                                                                                                                                                                                                                                   | **Confirmed**                                                                                                                                              |
| **Evidence**            | `cmd_wipe()` (defined at line 263) runs `docker run --rm -v "${CRYPTO_DIR}:/crypto" hyperledger/fabric-ca:1.5 sh -c "rm -rf /crypto/*"` (line 294) unconditionally         | Comment near`hasLiveProposalForApplicant` (lines 239-245): "CastVote has no code path that ever sets Status to 'rejected' yet... still an open gap"; actual code (lines 478-493) sets `proposal.Status = proposalStatusRejected` once approval becomes mathematically unreachable | `docker/peer-base.yaml:30`: `CORE_VM_ENDPOINT: unix:///host/var/run/docker.sock`; `org-add.sh:226,243`: identical socket bind-mount for runtime-added orgs |
| **Notes**               | Directly corroborated by this project's own build history (a real incident,`docs/BUILD_LOG.md`)                                                                              | A genuine, self-contradicting comment — not an interpretation                                                                                                                                                                                                                        | Standard Fabric pattern, but the security implication (compromised peer ≈ host root) was independently confirmed absent from all existing project documentation |

---

## STRUCTURE.md

| Field                         | SC-19                                                                                                                                                                                                                                                                                            | SC-20                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Claim**               | `backend/src/certificates/certificates.controller.ts` is a valid "example to copy" for a new backend endpoint                                                                                                                                                                                  | `frontend/src/proxy.ts` is Next.js 16's renamed replacement for the earlier `middleware.ts` convention |
| **Source(s) inspected** | `backend/src/certificates/certificates.controller.ts`                                                                                                                                                                                                                                          | `frontend/src/proxy.ts`                                                                                  |
| **Method**              | Direct read of the file                                                                                                                                                                                                                                                                          | Direct read of the file                                                                                    |
| **Result**              | **Confirmed**                                                                                                                                                                                                                                                                              | **Confirmed**                                                                                        |
| **Evidence**            | `@Controller('certificates')` with `@Post()`, `@Get(':certificateId')`, `@Get(':certificateId/verification')`, `@Post(':certificateId/revoke')` — the last with an explicit `@HttpCode(HttpStatus.OK)` override, matching the "clean, single-responsibility controller" description | File's own comment states the rename explicitly; exports`async function proxy(request: NextRequest)`     |
| **Notes**               | —                                                                                                                                                                                                                                                                                               | —                                                                                                         |

---

## Findings / Exceptions

**Exception E-01 — imprecise wording, not a factual error (relates to SC-11).**
`CONVENTIONS.md` states that chaincode "never calls `time.Now()`." This is
true of every production code path (confirmed by SC-11 above) but the
statement, as written, does not caveat that the test suites for both
chaincode packages call `time.Now()` extensively — over 50 occurrences
across `castvote_test.go`, `initledger_test.go`, `registerinstitution_test.go`,
`proposenewmember_test.go`, and `queries_test.go` — to construct fixed fake
timestamps for the test harness. This is expected and benign test-fixture
practice, not a violation of the underlying determinism rule the claim is
actually about. It is recorded here as a documentation-wording gap, not
counted against SC-11's verification result above.

---

## Summary

| Metric                                                                    | Count    |
| ------------------------------------------------------------------------- | -------- |
| Total claims checked                                                      | 20       |
| Claims confirmed                                                          | 20       |
| Claims partially correct                                                  | 0        |
| Claims incorrect                                                          | 0        |
| Documentation-wording exceptions noted (not counted against confirmation) | 1 (E-01) |

---

## Conclusion

The sampled verification provided a high level of confidence in the
factual accuracy of the generated Stage B documentation. While this does
not prove every generated statement is correct, no factual errors were
identified in the sampled claims, supporting the conclusion that the
framework reliably extracts technical information from the BLC-31
codebase. Remaining concerns identified during the evaluation relate to
process limitations — cross-file synthesis, isolation robustness, and
operational knowledge that only exists outside the source code — not
factual correctness. Those process limitations, and the independent human
review step that surfaced them, are addressed separately in the companion
evaluation report.
