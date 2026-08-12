---
last_verified: 2026-07-29
source: code-derived
confidence: medium
owner: tech lead
---

# Structure

```
BLC-Consortium-V1/
├── network/                     # Fabric network build/ops tooling + generated artifacts (not a runtime service)
│   ├── cmd/blcgen/               # Go CLI entry point: validate | version | generate {configtx,compose,profiles}
│   ├── internal/config/          # NetworkConfig/DeploymentConfig types, YAML loading, cross-field validation
│   ├── internal/generate/        # Template-data builders + Go text/template rendering for configtx/compose/profiles
│   ├── config/                   # network.yaml — hand-maintained, governance-relevant (orgs, channel, chaincode packaging)
│   ├── deployment/                # local.yaml — hand-maintained, infra-only (ports, Fabric/CA/CouchDB versions)
│   ├── templates/                 # .tmpl sources blcgen renders (configtx, docker-compose x2, connection-profile)
│   ├── generated/                 # blcgen OUTPUT — configtx.yaml, docker-compose files, connection-*.json, cc tarballs; never hand-edit
│   ├── crypto/                    # CA-server state + enrolled MSP/TLS material per org, produced by bootstrap-crypto.sh (root-owned in places)
│   ├── channel-artifacts/         # Genesis block (genesis.pb) built by configtxgen
│   ├── peercfg/                   # core.yaml — FABRIC_CFG_PATH target used by every `peer` CLI invocation in the scripts
│   └── scripts/                   # bash orchestration: network.sh (bootstrap), org-add.sh (runtime onboarding), chaincode.sh (cc lifecycle), lib/ (shared helpers)
├── chaincode/                    # Go smart contracts, one Fabric-contractapi module per directory
│   ├── institution-cc/            # Governance: InitLedger, RegisterInstitution, ProposeNewMember, CastVote, queries — no outbound calls
│   └── certificate-cc/            # Issuance/verification/revocation; calls institution-cc via InvokeChaincode (read-only)
├── backend/                       # NestJS "Fabric gateway" API — one deployed instance PER ORGANIZATION
│   └── src/
│       ├── fabric-gateway/         # Long-lived Gateway gRPC connection + Contract handles for this instance's one org identity
│       ├── institutions/           # HTTP surface: institution lookups (read-only proxy to institution-cc)
│       ├── certificates/           # HTTP surface: issue/get/verify/revoke (proxy to certificate-cc)
│       ├── common/                 # ApiKeyGuard (global bearer-token auth), FabricExceptionFilter (SDK error → HTTP status)
│       └── config/                 # env.validation.ts — fail-fast startup checks, including filesystem path existence
├── frontend/                      # Next.js 16 app — single deployed instance, session picks which org's backend to call
│   └── src/
│       ├── app/                    # App Router: login/ (public) and (dashboard)/ (session-gated: certificates, institutions)
│       ├── actions/                # "use server" Server Actions — the only place that calls backendFetch for writes
│       ├── components/             # Presentational React (certificate-table, status-badge, nav-bar) + components/ui/ (shadcn primitives)
│       ├── lib/                    # session.ts (signed JWT cookie), backend.ts (server-only fetch proxy), institutions.ts (hardcoded org directory), types.ts/format.ts/error-messages.ts
│       └── proxy.ts                # Next 16's middleware.ts replacement — session-verifying route gate
├── docker/                        # orderer-base.yaml / peer-base.yaml — shared compose fragments blcgen's templates extend
├── docs/                          # Design doc, build/error logs, demo prep — narrative project history, not verified as ground truth here
└── context/codebase/              # This map (ARCHITECTURE.md, STRUCTURE.md) — generated from source, not from docs/
```

Note on depth: `network/crypto/{ca-bootstrap,ca-servers,organizations}` and `network/generated/` contain many per-org, machine-produced subdirectories/files (MSP material, connection profiles, chaincode tarballs) — omitted below the annotation above since their shape is entirely determined by `network/config/network.yaml`'s organization list, not hand-authored structure.

## Where things go

| If you are adding a... | Put it in | Example to copy |
|---|---|---|
| Backend API endpoint | `backend/src/<feature>/<feature>.controller.ts` (+ service method, + DTO in `<feature>/dto/`) | `backend/src/certificates/certificates.controller.ts` — clean single-responsibility controller methods, each delegating straight to a service call and documented with `@ApiOperation`/`@ApiResponse` |
| Chaincode function (new business rule) | `chaincode/<cc-name>/<verb>.go` (one file per write-operation, matching `issuecertificate.go`/`revokecertificate.go`), read-only additions go in `queries.go` | `chaincode/certificate-cc/revokecertificate.go` — small, single-function file with the authorization check stated explicitly in a doc comment (why issuer-only, why it skips the active-institution check) |
| Cross-chaincode read from a new/other chaincode | A `requireX`-style helper next to the caller, using `ctx.GetStub().InvokeChaincode(name, args, ctx.GetStub().GetChannelID())` and a narrow local struct for the response shape (never import the other chaincode's Go package) | `chaincode/certificate-cc/issuecertificate.go`'s `requireActiveInstitution` + `remoteInstitution` struct |
| Frontend page (dashboard) | `frontend/src/app/(dashboard)/<segment>/page.tsx`, gated automatically by `proxy.ts` + `requireSession()` | `frontend/src/app/(dashboard)/certificates/verify/page.tsx` |
| Frontend write action (form submit) | `frontend/src/actions/<feature>.ts`, `"use server"`, calling `backendFetch` and mapping `BackendError` through `humanizeBackendError` | `frontend/src/actions/certificates.ts`'s `revokeCertificateAction` |
| Network config option (governance: new org, threshold, channel capability) | `network/config/network.yaml`, wired into `network/internal/config/types.go` (`NetworkConfig` struct) and checked in `network/internal/config/validate.go` | `network/internal/config/types.go`'s `Organizations []Organization` + the Channel/Orderer struct fields, each with a comment explaining why it's split from `deployment/local.yaml` |
| Network config option (infra: port, image version) | `network/deployment/local.yaml`, wired into `DeploymentConfig`/`OrgDeployment`/`OrdererDeployment` in the same `types.go` | `network/internal/config/types.go`'s `OrgDeployment`/`PeerPorts` structs |
| New org onboarding step | `network/scripts/org-add.sh` (add a numbered stage, update the header comment's stage list and `on_add_error`'s messaging) — never edit `network.sh`'s bootstrap path for this | `org-add.sh`'s existing 7-stage structure, e.g. `install_and_approve_chaincode` as the pattern for "per-org, idempotent, re-runnable" stage functions |
| Shared bash helper used by more than one script | `network/scripts/lib/<topic>.sh`, sourced by whichever of `network.sh`/`chaincode.sh`/`org-add.sh` need it | `network/scripts/lib/chaincode.sh` — already shared verbatim between `chaincode.sh` and `org-add.sh` |
| shadcn/ui primitive or design-system piece | `frontend/src/components/ui/` | `frontend/src/components/ui/button.tsx` |
