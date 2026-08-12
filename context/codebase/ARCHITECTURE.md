---
last_verified: 2026-07-29
source: code-derived
confidence: medium
owner: tech lead
---

# Architecture

## Style

A permissioned Hyperledger Fabric ledger network (3 orderers + per-org
peers/CouchDB, `network/`), fronted by one NestJS "gateway" API per
organization (`backend/`) that each hold a single admin identity for their
own org and talk to the chain via the Fabric Gateway SDK, in turn fronted by
one Next.js server-rendered app (`frontend/`) that logs a human into exactly
one institution's session and proxies every action to that institution's own
backend instance over plain HTTP with a shared-secret API key. Business logic
(governance voting, certificate issuance/verification/revocation) lives
entirely in two Go chaincodes; the backend is a thin translation layer
(DTOs + Fabric Gateway calls), and the frontend is a thinner presentation
layer again (session cookie + fetch proxy) with no chaincode awareness at
all. There is a separate, non-request-path Go CLI (`blcgen`) plus a set of
bash scripts that generate and operate the network's infrastructure
(crypto, channel config, chaincode lifecycle) — this is build/ops tooling,
not part of the runtime request path.

Concretely, that's four independently-deployed runtime unit *kinds*, each
multiplied per organization:
1. **Ledger tier** — Fabric peers/orderers/CouchDB per org (`network/`).
2. **Chaincode tier** — two chaincode-as-a-service (ccaas) Go binaries,
   `institution-cc` and `certificate-cc`, one container pair per org
   (`chaincode/`).
3. **API tier** — one NestJS instance per org, each with its own MSP admin
   identity, API key, and port (`backend/`).
4. **UI tier** — a single Next.js instance that knows every org's backend
   base URL/API key and picks one per logged-in session (`frontend/`).

Deployment/lifecycle tooling (`network/cmd/blcgen`, `network/scripts/`) is a
separate "two-pipeline" concern (see Key flows) — a bootstrap pipeline that
generates the whole network from scratch, and a runtime/add-org pipeline
that must never re-touch the bootstrap generator once the network is live.

Three distinct error-handling/module-boundary patterns coexist by design,
not by drift — each tier owns its own convention rather than sharing one:
Go chaincode returns plain `fmt.Errorf` strings with no error-code
convention; the NestJS backend catches Fabric Gateway SDK exception
*classes* (`EndorseError`/`CommitError`/`GatewayError`) and pattern-matches
the chaincode's raw strings inside them to HTTP status codes
(`FabricExceptionFilter`); the Next.js frontend catches its own
`BackendError` (HTTP status + message) and runs the message through a
separate humanization layer (`frontend/src/lib/error-messages.ts`, referenced
by every Server Action but not itself read in full during this pass). An
error crossing all three tiers is translated three times, by three
independent, hand-written mappings that must be kept in sync manually.

## Module map

| Module | Responsibility | May depend on | Must never depend on |
|---|---|---|---|
| `network/cmd/blcgen` + `network/internal/{config,generate}` | Go CLI: loads/validates `network.yaml` + `deployment/local.yaml`, renders `configtx.yaml`/docker-compose/connection-profile templates | `network/config`, `network/deployment`, `network/templates` | chaincode packages, backend, frontend |
| `network/scripts` (`network.sh`, `chaincode.sh`, `org-add.sh`, `lib/*`) | Bash orchestration: crypto bootstrap, container lifecycle, channel join, chaincode deploy, runtime org onboarding | `blcgen` output (`generated/`), `crypto/`, `peer`/`osnadmin`/`configtxgen`/`configtxlator` CLIs, institution-cc (read-only, via `peer chaincode query`) | certificate-cc business logic, backend, frontend; `org-add.sh` must never invoke `blcgen generate` (per its own header comment) |
| `chaincode/institution-cc` | Consortium governance: founding-institution seeding (`InitLedger`), registration, membership proposals, voting, institution queries | Fabric chaincode shim/contractapi only | `chaincode/certificate-cc` (no InvokeChaincode calls out; it is the callee, never the caller) |
| `chaincode/certificate-cc` | Certificate issuance, hashing, revocation, verification, consortium+issuer sequence counters | Fabric chaincode shim/contractapi; calls `institution-cc` via `ctx.GetStub().InvokeChaincode("institution-cc", ...)` for institution-status checks | writing to institution-cc's own state directly (it only reads, via the chaincode-to-chaincode call) |
| `backend/src/fabric-gateway` | One long-lived Fabric Gateway gRPC connection per instance; exposes `institution-cc`/`certificate-cc` `Contract` handles | filesystem paths (TLS root cert, admin cert/keystore) from env/`ConfigService` | `institutions`/`certificates` modules (it is depended on, not a dependent) |
| `backend/src/institutions` | HTTP surface for institution lookups + query-only proxy to institution-cc | `fabric-gateway` | `certificates` module's Fabric contract (it borrows `CertificatesService` only for the one composed `/institutions/:id/certificates` route) |
| `backend/src/certificates` | HTTP surface for issue/get/verify/revoke, proxied 1:1 to certificate-cc | `fabric-gateway` | `institutions` module (no import found) |
| `backend/src/common` (guards/filters) | Cross-cutting: global `ApiKeyGuard` (bearer-token auth), `FabricExceptionFilter` (Fabric SDK error → HTTP status mapping) | `@nestjs/common`, `@hyperledger/fabric-gateway` error types | any single feature module's business logic |
| `frontend/src/lib` (`session.ts`, `backend.ts`, `institutions.ts`) | Signed-cookie session (JWT via `jose`), server-only fetch proxy to the session's own backend instance, hardcoded institution/account directory | Next.js server runtime (`cookies()`, `redirect()`) | the Fabric Gateway SDK, chaincode, any other institution's backend base URL at request time |
| `frontend/src/app` (route segments) + `src/actions` | Server Components/Server Actions: login, dashboard, issue/verify/revoke certificate pages | `frontend/src/lib/*` | direct chain access — every read/write goes through `backendFetch` |

**Ambiguity flagged:** `institutions.controller.ts` injects `CertificatesService` directly (not through an `imports`-declared NestJS module boundary re-export) to serve `GET /institutions/:id/certificates` — a cross-module reach-in that works today because both are providers in the same `AppModule` tree, but is a soft coupling worth a boundary decision if a third module ever needs the same certificates data.

## Key flows

### 1. Institution onboarding / governance (chaincode-only — no backend or frontend surface exists for this flow)
1. Founding orgs are seeded once via `InitLedger(foundingMSPIDs)`, invoked as the Fabric `--isInit` transaction when `institution-cc` is first committed (`chaincode/institution-cc/governance.go:51`); `chaincode.sh deploy institution-cc --init-function InitLedger --init-args ...` is how this is actually triggered (per `network/scripts/chaincode.sh`'s own usage-comment block).
2. Each founding org calls `RegisterInstitution(name)` once for itself; it can only succeed if that org's MSP ID is in the founding list (`chaincode/institution-cc/governance.go:140`).
3. An existing active institution calls `ProposeNewMember(applicantID, applicantName)`, which rejects a duplicate live proposal and records `TotalEligibleVoters` as a snapshot at proposal time (`chaincode/institution-cc/governance.go:313`).
4. Other active institutions call `CastVote(proposalID, decision)`. Votes are one-per-institution (composite-key collision on a second vote), and the caller cannot vote on its own proposal (`chaincode/institution-cc/governance.go:379`).
5. When yes-votes reach `requiredVotesToApprove` (`totalEligibleVoters/2 + 1`, `governance.go:22`), `CastVote` itself creates the applicant's `Institution` asset in the same transaction — the applicant never calls `RegisterInstitution` (`governance.go:451-477`). If approval becomes mathematically impossible, the proposal is marked rejected in the same function (`governance.go:479-493`); `proposalStatusRejected` is otherwise unreachable in the code — an open gap the code's own comments flag, not an assumption of mine.
6. Only once an applicant is `active` in institution-cc's ledger can an operator run `network/scripts/org-add.sh <org-name>`, which itself queries `GetInstitution` as a fail-closed precondition (`org-add.sh`, `require_active_institution`, stage 1) before enrolling crypto, joining the channel, and installing/approving both chaincodes for the new org (stages 2-6), then flips `network.yaml`'s status from `pending` to `member` (stage 7, `flip_status_to_member`).
7. **Gap found in code**: neither `backend/src/institutions` nor any frontend route calls `ProposeNewMember`/`CastVote`/`RegisterInstitution`. The entire governance flow is only reachable via direct `peer chaincode invoke`/scripts today — the UI and API only expose read-only institution lookups (`backend/src/institutions/institutions.controller.ts`).

### 2. Certificate issuance → verification → revocation (frontend → backend → certificate-cc, with a live cross-chaincode check)
1. Frontend: `issueCertificateAction` (`frontend/src/actions/certificates.ts:14`) collects holderName/holderDetails/metadata from a form, calls `backendFetch(session.institutionId, "/certificates", {POST, ...})` (`frontend/src/lib/backend.ts:21`), which looks up that institution's own `baseUrl`+`apiKey` from the hardcoded directory (`frontend/src/lib/institutions.ts`) and sends `Authorization: Bearer <apiKey>`.
2. Backend: `CertificatesController.issueCertificate` (`backend/src/certificates/certificates.controller.ts:17`) → `CertificatesService.issueCertificate` (`certificates.service.ts:13`) calls `contract.submitTransaction('IssueCertificate', holderName, holderDetails, JSON.stringify(metadata))` on the certificate-cc `Contract` obtained from `FabricGatewayService` (`fabric-gateway.service.ts:66`) — this backend instance's own MSP identity is the transaction's signer, so "which institution issues" is fixed by which backend/org this HTTP request hit, not by any request body field.
3. Chaincode: `IssueCertificate` (`chaincode/certificate-cc/issuecertificate.go:122`) reads the caller's MSP ID and calls `requireActiveInstitution`, which does `ctx.GetStub().InvokeChaincode("institution-cc", [][]byte{[]byte("GetInstitution"), []byte(mspID)}, channelID)` (`issuecertificate.go:37`) — a live, peer-local cross-chaincode call, not a cached/duplicated copy of institution state. It then computes a SHA-256 hash over holderName+holderDetails+metadata only (`certificate.go:38`), assigns a consortium-wide sequence number and a per-issuer sequence number (two separate counters, `issuecertificate.go:61-102`), and writes the `Certificate` asset.
4. Verification (read-only, any caller): `VerifyCertificate` (`chaincode/certificate-cc/queries.go:67`) recomputes the hash and compares; it reports `TAMPERED` before ever checking `REVOKED` — a tampered-and-revoked certificate always reports `TAMPERED` (`queries.go:81-87`). Reached via `GET /certificates/:id/verification` → `frontend/src/app/(dashboard)/certificates/verify/page.tsx`.
5. Revocation: `RevokeCertificate` (`chaincode/certificate-cc/revokecertificate.go:19`) requires `certificate.IssuerID == callerMSP` exactly — stricter than "any active institution," and deliberately does not call `requireActiveInstitution`, so an institution that has since gone inactive can still revoke its own past issuances. Reached via `POST /certificates/:id/revoke` → `revokeCertificateAction` (`frontend/src/actions/certificates.ts:66`).
6. Errors at every step of 2-5 flow back through `FabricExceptionFilter` (`backend/src/common/filters/fabric-exception.filter.ts`), which pattern-matches the chaincode's raw `fmt.Errorf` strings to HTTP status codes — the filter's own comment flags this table as unverified against live output, i.e. an acknowledged fragility, not settled fact.

### 3. Network bootstrap vs. runtime org-add ("two-pipeline" split, load-bearing across every network file read)
1. **Bootstrap pipeline** (`network/scripts/network.sh up`, 10 stages): validate `network.yaml`+`deployment/local.yaml` via `blcgen validate`, generate docker-compose via `blcgen generate compose`, bootstrap CA/enroll crypto for every founding/member org, generate `configtx.yaml` via `blcgen generate configtx`, build the genesis block with `configtxgen`, start containers, generate connection profiles, join orderers/peers to the channel, verify membership (`network.sh`'s `cmd_up`). This is the only path allowed to call `blcgen generate`.
2. **Runtime pipeline** (`network/scripts/org-add.sh <org-name>`, 7 stages): onboards one org that is already `active` in institution-cc's ledger (per Flow 1) into an already-running network — crypto enrollment and container start via plain `docker run` (never docker-compose, never `blcgen generate` — explicitly forbidden by `org-add.sh`'s own header comment), a channel config-update signed by existing orgs' admins to inject the new org's MSP, a second config-update signed by the new org's own admin for anchor peers, peer channel join from the original genesis block, then install+approve (not commit — the definition already exists) both chaincodes for the new org, and finally flip `network.yaml` status from `pending` to `member`.
3. `network/scripts/chaincode.sh deploy <name>` is shared machinery both pipelines call into (`lib/chaincode.sh`'s `package_and_install_for_org`/`approve_for_org` functions are reused verbatim by `org-add.sh`) — this is the one piece of overlap the two pipelines are allowed to share.

## Boundaries and contracts

- **Frontend ↔ Backend**: plain HTTP/JSON, one backend base URL + API key per institution, hardcoded in `frontend/src/lib/institutions.ts` (server-only module, never sent to the browser). Every backend route requires `Authorization: Bearer <API_KEY>` globally (`ApiKeyGuard`, applied in `main.ts`) — there is no per-endpoint auth variance. The browser never talks to a backend directly; all calls happen from Next.js Server Actions/Server Components (`backendFetch`, `frontend/src/lib/backend.ts`), which is also why CORS is a non-issue by construction, not by configuration.
- **Backend ↔ Fabric (Gateway contract)**: each backend instance holds exactly one org's admin identity (mTLS via `ADMIN_CERT_PATH`/`ADMIN_KEYSTORE_DIR`, gRPC to `PEER_ENDPOINT`) and can only submit/evaluate transactions as that org (`fabric-gateway.service.ts`). DTOs in `backend/src/{certificates,institutions}/dto/*.dto.ts` mirror the chaincode Go structs field-for-field by comment convention ("Mirrors chaincode/.../model.go's ... struct exactly") — this is a manually-maintained contract, not generated/verified from the Go source; drift between the two is possible and would only surface at runtime as a swallowed/misparsed field.
- **Cross-chaincode**: exactly one direction exists — `certificate-cc` → `institution-cc` via `InvokeChaincode("institution-cc", ["GetInstitution", mspID], channelID)` (`issuecertificate.go:37-54`), read-only, peer-local (requires `institution-cc` installed on the invoking peer), and its read set is merged into the calling transaction so a change to the queried institution between simulation and commit invalidates the whole transaction. No call in the opposite direction exists — `institution-cc` has no reference to `certificate-cc` anywhere in its source.
- **Chaincode state ownership**: `institution-cc` owns `Institution`/`MembershipProposal`/`Vote` docTypes; `certificate-cc` owns `Certificate` and the two sequence-counter docTypes. Neither chaincode writes to the other's docType space — the only cross-chaincode contact point is the read described above. An agent must not add a write from one chaincode into the other's key space without an ADR; the existing design deliberately keeps governance and certificate issuance as separately-scoped ledgers joined only by a narrow read-only status check.
- **Network config ↔ generated artifacts**: `network/config/network.yaml` (who's in the consortium, governance-relevant) and `network/deployment/local.yaml` (ports/versions, infra-only) are hand-maintained inputs; everything under `network/generated/` is `blcgen` output and must never be hand-edited (regenerated by `blcgen generate {configtx,compose,profiles}`). `org-add.sh` is the one process allowed to hand-edit `network.yaml` itself (flipping one org's `status` field), and only as its last stage.
- **Login/session boundary (frontend)**: `frontend/src/actions/auth.ts`'s login is explicitly cosmetic — a hardcoded email/password list with no hashing, by the code's own comment, because "the store IS the source file." The real access-control boundary is the backend's `API_KEY`, not this login. The session cookie is a signed/expiring JWT (institutionId claim only, `jose`/HS256), verified independently in both `frontend/src/proxy.ts` (route-level redirect gate) and `frontend/src/lib/session.ts`'s `requireSession()` (defense-in-depth, not redundant, per the code's own comment citing Next.js's guidance against relying solely on middleware).
