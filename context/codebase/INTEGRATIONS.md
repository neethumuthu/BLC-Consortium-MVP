---
last_verified: 2026-07-29
source: code-derived
confidence: medium
owner: tech lead
---

# Integrations

| Service | Used for | Entry point in code | Sandbox available? | Gotchas |
|---|---|---|---|---|
| Hyperledger Fabric network (peer gRPC endpoint) | Core integration: backend submits/evaluates chaincode transactions (issue/revoke/verify certificates, institution lookups) as one org's identity | `backend/src/fabric-gateway/fabric-gateway.service.ts` (`FabricGatewayService`, uses `@hyperledger/fabric-gateway` `connect()` + `@grpc/grpc-js`); identity/key loading in `backend/src/fabric-gateway/fabric-identity.util.ts` | Only local Docker-Compose network (`network/generated/docker-compose-net.yaml`); no hosted/cloud Fabric or public testnet found | One gRPC connection established once at startup (`onModuleInit`) and reused for the process lifetime — no reconnect/retry logic observed. Peer endpoint, MSP ID, and admin identity paths are all per-instance env vars; a misconfigured path fails fast at boot via `backend/src/config/env.validation.ts` (checks `existsSync` on cert/key paths before the app starts). |
| Fabric chaincode: `certificate-cc` | Certificate issue/lookup/verify/revoke smart contract | `chaincode/certificate-cc/main.go`; invoked from backend via `FabricGatewayService.getCertificateContract()` and `backend/src/certificates/certificates.service.ts` | Same local network only | Runs as chaincode-as-a-service (ccaas); `main.go` explicitly sets `TLSProps: shim.TLSProperties{Disabled: true}` for the peer↔chaincode-server hop, with a code comment stating this is "deliberately disabled ... for this MVP". `CHAINCODE_ID`/`CHAINCODE_SERVER_ADDRESS` are required env vars (process panics if either is empty). |
| Fabric chaincode: `institution-cc` | Institution registry/lookup smart contract | `chaincode/institution-cc/main.go`; invoked from backend via `FabricGatewayService.getInstitutionContract()` and `backend/src/institutions/institutions.service.ts` | Same local network only | Same ccaas pattern and same disabled-TLS setup as `certificate-cc` (identical `main.go` structure). |
| Fabric CA (`fabric-ca-server`) | Issues MSP identities/certs for orderers, peers, and admin users during network bootstrap | `network/scripts/bootstrap-crypto.sh`; containers defined in `network/generated/docker-compose-ca.yaml` | Local only (`hyperledger/fabric-ca:1.5.15` container per org) | `FABRIC_CA_SERVER_TLS_ENABLED=false` for every CA (`ca.BLCOrderer`, `ca.BLCFounder`, `ca.InstitutionA`, `ca.InstitutionB`) — CA server TLS is off. Bootstrap admin credentials are hardcoded in the compose command: `fabric-ca-server start -b admin:adminpw`. |
| CouchDB | Fabric peer state database (rich queries over ledger state) | `network/generated/docker-compose-net.yaml` (one `couchdb.peer<N>.<Org>` container per peer); peers point at it via `CORE_LEDGER_STATE_COUCHDBCONFIG_*` env vars | Local only (`couchdb:3.3` image) | Hardcoded credentials on every instance: `COUCHDB_USER=admin` / `COUCHDB_PASSWORD=adminpw` (also repeated as `couchdb_admin_user`/`couchdb_admin_password` in `network/deployment/local.yaml`). CouchDB ports are exposed to the host per peer (e.g. `5984`, `5994`, `6984`, `6994`, `7984`, `7994`) with no auth in front of the exposed port beyond CouchDB's own basic auth. |
| Frontend → Backend HTTP API | Next.js server-side actions/pages call the NestJS backend as a specific institution | `frontend/src/lib/backend.ts` (`backendFetch`), consumed from `frontend/src/actions/auth.ts` and `frontend/src/actions/certificates.ts` | No separate sandbox/mock backend found; frontend always talks to a real backend instance (`http://localhost:3001/3002/3003`, one per org) | `baseUrl` values for all three institutions are **hardcoded** in `frontend/src/lib/institutions.ts` (`http://localhost:3001` etc.) — not env-driven. Browser never calls the backend directly (calls are server-side only, per an explicit comment: "this is what keeps CORS out of the picture entirely"). |
| Backend HTTP API auth | Every backend route requires a shared-secret bearer token | `backend/src/common/guards/api-key.guard.ts` (`ApiKeyGuard`), applied globally in `backend/src/main.ts` via `app.useGlobalGuards` | N/A (single shared secret per org, no key rotation/scopes observed) | Simple exact-string comparison of `Authorization: Bearer <API_KEY>` header against the configured `API_KEY` env var — no rate limiting, no per-route scoping, no signature/HMAC scheme. |
| Swagger / OpenAPI UI | API documentation, generated per running backend instance | `backend/src/main.ts` (`SwaggerModule.setup('api', app, document)`) | N/A | Swagger UI is mounted at `/api` on every instance and is **not excluded** from the global `ApiKeyGuard` in the code reviewed — i.e. it also requires the bearer token like any other route, based on `app.useGlobalGuards` being registered before/covering all routes. |

## Webhooks we receive

None found. No webhook endpoint, signature-verification code, or inbound-callback route exists anywhere in `backend/src` or `frontend/src`.

## Environment variables

Backend (`backend/.env.example`, plus per-org files `.env.blcfounder`, `.env.institutiona`, `.env.institutionb`; loaded via `@nestjs/config` in `backend/src/app.module.ts`, path selectable via `ENV_FILE`, validated in `backend/src/config/env.validation.ts`):

| Name | Purpose | Where the value comes from |
|---|---|---|
| `MSP_ID` | Which org's identity this backend instance acts as | `.env` file (one per org) |
| `PEER_ENDPOINT` | gRPC address of the peer this instance connects to | `.env` file |
| `PEER_TLS_ROOTCERT_PATH` | Path to the peer's TLS root cert, used to build the gRPC TLS credentials | `.env` file; checked to exist on disk at boot |
| `ADMIN_CERT_PATH` | Path to the admin identity's signing certificate | `.env` file; checked to exist on disk at boot |
| `ADMIN_KEYSTORE_DIR` | Directory containing the admin identity's private key (`*_sk` file, located by glob in `fabric-identity.util.ts`) | `.env` file; checked to exist on disk at boot |
| `CHANNEL_NAME` | Fabric channel to connect to (`blcchannel` in the example) | `.env` file |
| `INSTITUTION_CC_NAME` | Chaincode name for the institution contract | `.env` file |
| `CERTIFICATE_CC_NAME` | Chaincode name for the certificate contract | `.env` file |
| `HTTP_PORT` | Port the NestJS HTTP server listens on | `.env` file |
| `API_KEY` | Shared secret required on every inbound request (`ApiKeyGuard`) | `.env` file (placeholder value in `.env.example`; real value expected to be a random per-instance secret, per the file's own comment) |
| `ENV_FILE` | Overrides which `.env` file `ConfigModule` loads (defaults to `.env`) | Process environment (not from a file) |

Frontend (`frontend/.env.local`, `.env.local.example`; read directly via `process.env` in `frontend/src/lib/institutions.ts`, `frontend/src/lib/session.ts`, `frontend/src/proxy.ts`):

| Name | Purpose | Where the value comes from |
|---|---|---|
| `BLCFOUNDER_API_KEY` | Bearer token the frontend sends when calling BLC Founder's backend instance | `.env.local` (must match that backend instance's `API_KEY`) |
| `INSTITUTIONA_API_KEY` | Bearer token for Institution A's backend instance | `.env.local` |
| `INSTITUTIONB_API_KEY` | Bearer token for Institution B's backend instance | `.env.local` |
| `SESSION_SECRET` | HMAC secret used to sign/verify the `blc_session` JWT cookie | `.env.local` |

Go chaincode (`chaincode/certificate-cc/main.go`, `chaincode/institution-cc/main.go` — application-level `os.Getenv` calls only; vendored dependencies also read many unrelated env vars, not listed here):

| Name | Purpose | Where the value comes from |
|---|---|---|
| `CHAINCODE_ID` | Package ID the ccaas server registers as with the peer | Set per-org by `network/scripts/chaincode.sh` / `network/scripts/lib/chaincode.sh` at container start (not a `.env` file) |
| `CHAINCODE_SERVER_ADDRESS` | Address the ccaas gRPC server binds to (e.g. `0.0.0.0:<port>`) | Same — set by `network/scripts/lib/chaincode.sh` (`start_ccaas_container`) |

## Other observed gotchas

- Frontend login is described in code comments as "cosmetic" — `frontend/src/lib/institutions.ts` hardcodes plaintext per-institution passwords (e.g. `"Fo6nder!Portal"`) directly in source, compared with a plain string equality check (no hashing). The file's own comment argues hashing wouldn't reduce real risk here since the "credential store" is the source file itself — noted as-is, not endorsed or disputed here.
- No `.github/workflows`, so there is no automated CI check (build/lint/test) gating changes to backend, frontend, chaincode, or network tooling in this repository.
