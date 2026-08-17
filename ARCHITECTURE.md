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

> **Known limitation (2026-07-07, corrected 2026-08-17):** "production-grade"
> (above) refers only to the Fabric network's *topology* (orderer/peer
> counts) — it does **not** mean the deployment is production-hardened on
> security. CouchDB admin credentials (`deployment/local.yaml`'s
> `couchdb_admin_user`/`couchdb_admin_password`) were rotated 2026-08-17
> away from the well-known Fabric-tutorial default (`admin`/`adminpw`)
> ahead of making this repo public — still a static, committed value
> shared by every clone, not a true per-deployment secret (see
> `context/codebase/CONCERNS.md`). This remains a local-dev placeholder,
> acceptable for this MVP's Docker Compose-on-one-machine scope, but
> **must** be replaced with a real secrets-management approach (env file
> outside git, Docker secrets, or a vault) before this ever runs anywhere
> other than a developer's own machine. Tracked here rather than fixed
> now since secrets management is explicitly a deployment-target concern,
> not a network-topology one, and this MVP has no deployment target other
> than local Compose yet.
>
> **Same local-dev-scope caveat applies (2026-07-09):** TLS on the
> peer↔chaincode-server hop (the connection each peer makes to a
> chaincode-as-a-service container, per the amendment below) is disabled
> — `connection.json`'s `tls_required: false`, and each chaincode's
> `ChaincodeServer.TLSProps.Disabled: true`. Acceptable for the same
> reason as the CouchDB credentials above: everything runs on one
> machine's Docker bridge network, with no external exposure. Must be
> revisited (TLS material enrolled per org's chaincode service, same as
> peers already have) before any deployment target other than local
> Compose.

> **Amendment (2026-07-09): chaincode packaging is `ccaas`, not
> `classic`, sooner than planned.** Key decision #6 below ("MVP uses
> classic; ccaas is the documented production migration path") assumed
> classic packaging would work for the MVP, with ccaas deferred until
> there was a real need. That need arrived immediately: Fabric 2.5.0's
> bundled Docker client (used by the peer's own internal "classic"
> golang builder, which builds a chaincode image via a nested
> `/var/run/docker.sock` bind mount) is incompatible with this host's
> Docker Engine version — confirmed by direct diagnosis, not assumed:
> the daemon's own logs show no error at all when the peer's build
> fails, and an isolation test proved a *modern* Docker client builds
> fine against the same daemon via BuildKit, while Fabric's old client
> cannot. This is a real, confirmed blocker, not a preference change.
> `institution-cc` now runs as a `shim.ChaincodeServer`, built into its
> own Docker image via a plain host-side `docker build` (bypassing the
> peer's broken internal path entirely), one container per founding/
> member org. `chaincode.sh` (Phase 7) implements this — see
> `docs/BUILD_LOG.md`'s Phase 7 entry for the full diagnosis and the
> verified sequence (adapted from Fabric's own
> `fabric-samples/test-network/scripts/deployCCAAS.sh`). Applies to
> `certificate-cc` (Phase 8) too, via the same script — there was never
> a real "classic" option available on this host once the
> incompatibility was confirmed.

> **Scope note (2026-07-09):** the team's sprint-planning notes describe
> "partnering institutions" — institutions that issue certificates under
> their own name plus "official partner of [institution name]" branding,
> with a separate question of whether a partner needs its own vetting —
> as v1.01 (licensing) scope, one sprint after this MVP's v1.0.
> **`certificate-cc`'s `Certificate` struct (Phase 8) has no
> representation of this at all** — no partner/affiliation field, no
> licensing relationship, no second-tier vetting. Noted explicitly so
> nothing later assumes Phase 8's direct-issuance design already accounts
> for partnership-branded certificates; it doesn't, and isn't scoped to
> yet. See `docs/BUILD_LOG.md`'s Phase 8 entry for the rest of this
> sprint-planning cross-check (also resolved the `RevokeCertificate`
> scope question the same way).

> **Scope note (2026-07-09, updated once `certificate-cc` existed to
> name both chaincodes explicitly rather than "either chaincode"):
> `org-add.sh` (Phase 9) must install **both `institution-cc` and
> `certificate-cc`** for a newly-joining org, not just join it to the
> channel.** Cross-chaincode calls — `certificate-cc`'s
> `IssueCertificate` checking `institution-cc`'s ledger via
> `InvokeChaincode`, see `docs/BUILD_LOG.md`'s Phase 8 entry — are
> peer-local: Fabric requires the invoked chaincode installed on
> whatever peer executes the invoking one. The Runtime pipeline
> described above (fetch channel config → decode → inject MSP → collect
> signatures → submit config-update → set anchor peer) has no
> chaincode-installation step at all. A newly-joined org would be a
> channel member unable to successfully call `certificate-cc` (needs
> both installed) or even `institution-cc` alone (needs at least that
> one) until this is addressed — noted now so Phase 9's design starts
> from installing **both**, not one, instead of discovering the second
> mid-implementation.

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

10. **Backend HTTP-level authentication (2026-07-28) — implemented, not
    just a documented prerequisite anymore.** From 2026-07-20 through
    2026-07-27, the NestJS Gateway trusted every HTTP caller, with the
    only identity boundary being which org's Fabric signing key a given
    running instance held — valid only for localhost-only,
    screen-shared demos, per this decision's original wording. Cloud
    deployment (Azure/AKS) became a concrete near-term plan on
    2026-07-28, which made that prerequisite immediately actionable
    rather than hypothetical. **Implemented: a shared API key per
    instance** (`API_KEY` env var, `backend/src/common/guards/
    api-key.guard.ts`, applied globally in `main.ts` via
    `app.useGlobalGuards`) — every route now requires
    `Authorization: Bearer <API_KEY>`, or rejects with `401`. This
    closes the original gap: a network-reachable caller with no key can
    no longer invoke `IssueCertificate`/`RevokeCertificate` as any
    institution. **What this does not add:** per-human-user accounts,
    token expiry/revocation, or rate-limiting — this is still
    institution-level identity only (one key per instance, matching the
    one-Fabric-identity-per-instance model), not a full user-auth
    system. TLS/HTTPS termination and cloud secrets-manager (e.g. Azure
    Key Vault) integration remain deployment-time concerns, not covered
    by this decision.

11. **The frontend's login screen (2026-07-27) is cosmetic — a UI-only
    routing gate, not a substitute for decision #10's backend
    protection.** `frontend/` is a single Next.js app with a
    real-looking username/password login
    (`frontend/src/lib/institutions.ts`), passwords deliberately kept as
    plain strings, not hashed — hashing would protect against a
    credential-store leak separate from the source code, but here the
    "store" IS the source file, so hashing wouldn't reduce any actual
    risk (considered and explicitly rejected as scope creep on
    2026-07-28). As of 2026-07-28, the session cookie IS a signed,
    expiring JWT (`frontend/src/lib/session.ts`, via `jose`) rather than
    a bare institution-ID string — that part closes a real, specific
    forgeability gap found during that review: previously, any request
    could set `Cookie: blc_session=BLCFounderMSP` directly (institution
    IDs aren't secret) and obtain a full session with zero login, since
    `httpOnly` only stops JavaScript from reading/editing a cookie, not
    a request crafted outside the browser. Because `getSession()` looks
    up that institution's *real* API key server-side purely from the
    cookie's claimed institutionId, a forged cookie would have let
    someone make real, API-key-authenticated backend calls as any
    institution with zero password — a genuine auth bypass, not
    theoretical, which is why this one was fixed and hashing wasn't.
    **Still true, unchanged:** there is no user database (one fixed
    account per institution) and this login itself is not what protects
    the backend API — that's decision #10's API key, sent by
    `frontend/src/lib/backend.ts` on every request. This is documented
    here, in `frontend/src/lib/institutions.ts`, and in
    `docs/BUILD_LOG.md` so the login's cosmetic role is never mistaken
    for the actual security boundary.

12. **A full network wipe restores infrastructure membership but NOT
    ledger membership for non-founding institutions — a standing gap,
    not a one-off InstitutionB fix.** This system splits organization
    "membership" across two independent layers, and `network.sh down
    --wipe && up` only rebuilds one of them:
    - **Fabric/infrastructure layer** (crypto, peers, CouchDB, channel
      join, chaincode install): driven entirely by `network.yaml`'s
      `organizations[].status` field. Any org with status `founding` OR
      `member` gets fully bootstrapped by a fresh `network.sh up` /
      `chaincode.sh deploy`, with no distinction between the two
      statuses at this layer.
    - **`institution-cc` ledger layer** (whether `GetAllInstitutions`
      actually lists the org as an active institution): `InitLedger`
      only registers `founding` orgs as eligible voters — it does not
      create `Institution` records for anyone. `RegisterInstitution`
      explicitly rejects non-founding callers. The **only** code path
      that creates a non-founding org's `Institution` ledger record is
      `CastVote` reaching approval threshold (`governance.go`).
    **Consequence:** after any full wipe, an org already listed as a
    real `member` in `network.yaml` (not a rehearsal artifact left over
    from a prior demo — see decision-adjacent `docs/ERROR_LOG.md`
    entries on that separate, already-known gotcha) will have its
    infrastructure silently restored looking completely healthy
    (containers up, chaincode installed, channel joined) while being
    **absent from `GetAllInstitutions`** until its onboarding governance
    ceremony — `ProposeNewMember` then enough `CastVote` approvals — is
    manually redone. `org-add.sh` itself is not what's needed here
    (that would try to redo already-complete infrastructure work); only
    the two chaincode governance calls are. This applies to *any*
    current or future non-founding member, not just `InstitutionB` —
    check `GetAllInstitutions` after every full wipe before assuming a
    rebuilt network's application state matches its infrastructure
    state.

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
