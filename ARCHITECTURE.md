# BLC-31 Network Architecture — Frozen Design

Status: **Frozen for MVP (v1.0)**. Change only on discovering a real limitation
during implementation, not on new ideas — file those as follow-ups instead.

> **Amendment (2026-07-06):** the Fabric network's own internal topology is
> no longer single-node. After reviewing a prior project's production Fabric
> setup, the decision was made to build BLC-31's network layer at
> production-grade resilience from the start — **3 orderer nodes** (Raft
> quorum tolerating 1 failure; 2 nodes was considered and rejected, since
> Raft needs a majority and 2 nodes tolerates zero failures, same as 1) and
> **2 peers per organization** (so one peer can restart/upgrade without
> taking the org offline). This supersedes the "multi-orderer production
> topology"/"high availability" line in the Non-goals section below — those
> non-goals still hold for **cloud/Kubernetes deployment**, which remains
> explicitly out of scope; this amendment is about the network's internal
> shape, not where it runs. See project memory
> `project_blc31_production_topology` for the full rationale. Everything
> else on this page (two-pipeline model, config split, repo structure) is
> unaffected.

> **Known limitation (2026-07-07):** "production-grade" (above) refers
> only to the Fabric network's *topology* (orderer/peer counts) — it does
> **not** mean the deployment is production-hardened on security. CouchDB
> admin credentials (`deployment/local.yaml`'s `couchdb_admin_user`/
> `couchdb_admin_password`) currently default to `admin`/`adminpw` in
> plain text in a committed config file. This is a local-dev placeholder,
> acceptable for this MVP's Docker Compose-on-one-machine scope, but
> **must** be replaced with a real secrets-management approach (env file
> outside git, Docker secrets, or a vault) before this ever runs anywhere
> other than a developer's own machine. Tracked here rather than fixed
> now since secrets management is explicitly a deployment-target concern,
> not a network-topology one, and this MVP has no deployment target other
> than local Compose yet.

## Origin

Synthesized from two prior projects, not copied from either:

| From CBDC | From FarmKube |
|---|---|
| Custom network (not test-network) | Clean backend separation (NestJS) |
| Fabric CA-based enrollment | Production/Kubernetes-ready thinking |
| Bootstrap script sequence | `./network <verb>` CLI ergonomics |
| Classic chaincode lifecycle | — |

Explicitly **not** carried forward: CBDC's hardcoded paths and duplicated
per-org config; FarmKube's tight coupling to HLF Operator + Kubernetes for
what is a local-first v1.0.

## Core principle: two pipelines, not one

Fabric has two structurally different phases. They must not share tooling.

**Bootstrap** (pre-launch, safe to fully regenerate):
```
network.yaml + deployment/local.yaml
        → blcgen validate
        → blcgen generate
        → configtx.yaml, docker-compose.yaml, connection-*.json
        → network.sh up
```

**Runtime** (live channel, incremental only — never regenerated):
```
Institution status: pending
        → org-add.sh
        → fetch channel config → decode → inject MSP → collect admin
          signatures → submit config-update → set anchor peer
        → status: member
```

`org-add.sh` is the mechanism behind BLC-31's demo centerpiece (a third
institution joining live) and must never touch `blcgen generate` or restart
the network.

## Repository structure

```
blc/
├── backend/                    # NestJS Fabric Gateway service
├── frontend/
├── chaincode/
│   ├── institution-cc/         # governance / voting
│   └── certificate-cc/         # issuance / verification
├── network/
│   ├── config/
│   │   └── network.yaml        # architecture: orgs, policies, channel, capabilities
│   ├── deployment/
│   │   └── local.yaml          # infra: ports, image tags, volumes (dev.yaml, prod.yaml later)
│   ├── templates/              # *.tmpl — hand-written, source of truth for generation
│   ├── generated/              # gitignored — never hand-edited
│   ├── crypto/                 # gitignored — organizations/ + wallets/ (identity material)
│   ├── channel-artifacts/      # gitignored — configtxgen output
│   ├── cmd/blcgen/main.go      # validate | generate | version
│   └── scripts/
│       ├── network.sh          # up / down / status
│       ├── org-add.sh          # runtime config-update flow
│       ├── chaincode.sh        # deploy/upgrade, packaging-aware
│       └── lib/                # shared bash: env loading, logging, error handling
├── docker/                     # hand-written base compose fragments (peer-base, orderer-base)
└── docs/
```

## Key decisions

1. **Single source of truth, split by lifecycle.** `network.yaml` (architecture:
   orgs, policies, channel) and `deployment/*.yaml` (infra: ports, versions) are
   separate because they change for different reasons. No org/MSP/port value is
   ever duplicated by hand across multiple files.

2. **Organizations are one list with a `status` field** (`founding | pending |
   member`), not separate sections. `org-add.sh` flips `pending → member` after
   a successful config-update. No restructuring the file as institutions join.

3. **Generator is a Go CLI (`blcgen`)**, not Python/Node/envsubst. Reasoning:
   the chaincode toolchain (Go) is already a hard requirement, so this adds no
   new dependency; a compiled binary has no install-step drift on a fresh
   machine, which matters for tooling that runs *before* the network exists.
   `text/template` is sufficient — no need for a heavier templating engine.

4. **Validation is a mandatory separate phase before generation**, not a
   try/catch around it: `blcgen validate` checks unique org names, unique MSP
   IDs, unique ports, valid `status` values, sane Raft count, channel name
   present — before any template executes. Catches config errors as precise
   messages instead of template-execution panics.

5. **No committed runtime state file.** Chaincode sequence numbers and
   channel membership are queried live from the network (`peer lifecycle
   chaincode querycommitted`, `peer channel fetch`) — never cached in git.
   The ledger is the only source of truth; a stale cached file would drift
   from it silently.

6. **Chaincode packaging (`classic` vs `ccaas`) is a deployment-layer concern
   only.** `institution-cc` and `certificate-cc` are written with zero
   awareness of how they're packaged. Only `chaincode.sh` knows. MVP uses
   `classic`; `ccaas` is the documented production migration path.

7. **Wallets live under `crypto/`, not `generated/`.** They hold identity
   material (private keys), not rendered config — same gitignore treatment
   as MSP material, different mental category from configtx/compose output.

8. **Docker Compose is layered** (`peer-base.yaml` → `docker-compose-base.yaml`
   → `docker-compose.yaml`), generated by looping over `network.yaml`'s org
   list — avoids a single monolithic file that grows linearly with org count.

9. **Deferred, not rejected:** `network/examples/` (multiple test topologies),
   `blcgen doctor` (environment preflight). Both are cheap to add later and
   don't need to exist before the MVP works.

## Implementation order

1. Repo folder skeleton + `.gitignore` (`generated/`, `crypto/`, `channel-artifacts/`)
2. `network.yaml` + `deployment/local.yaml` schemas as Go structs
3. `blcgen validate` — including a test fixture that's deliberately broken
4. `blcgen generate configtx` only — get one template fully correct
5. `blcgen generate compose/profiles` — docker-compose, core.yaml, connection profiles
6. `network.sh up` — 2-org network running, no chaincode yet
7. Deploy `institution-cc`
8. Deploy `certificate-cc`
9. `org-add.sh` — the live third-institution join
