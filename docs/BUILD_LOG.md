# BLC-31 Build Log

Chronological record of implementation steps and the exact commands used to
produce them. One section per phase, in the order defined in `ARCHITECTURE.md`
/ the build prompt. Append to this file as work proceeds — do not rewrite
history, only add.

**Convention (added 2026-07-09, after a real instance of this exact
mistake — see Phase 8's `ERROR_LOG.md` entry on the "environment
restored" claim):** any claim that a network or chaincode state is
"restored," "clean," or "confirmed working" must name exactly which
assertions were actually checked — e.g. "`InitLedger` confirmed via
querycommitted; `RegisterInstitution` not re-verified" — not a blanket
"confirmed clean." Precision of scope, not confidence of tone.

**Convention (added 2026-07-14, after two real instances of stale-claim
drift — the "restored to clean state" claim above, and a "per-institution
certificate counter still pending Szymon" claim that was repeated across
several turns before being caught, when `IssuerSequenceNumber` had
already shipped in Phase 8):** before restating any "still open," "still
pending," or "not yet done" item that hasn't been touched in several
turns, re-verify it against the actual current code/state rather than
repeating the earlier claim from memory. A status claim is only as good
as the last time it was actually checked — long sessions make it easy to
carry a stale claim forward unchallenged, since nothing forces a
re-check unless something prompts one. Both instances so far were
caught, but only because something external prompted the re-check, not
because the drift was noticed proactively.

---

## Phase 1 — Repository skeleton

**Goal:** create the folder tree, `.gitignore` for generated/crypto artifacts,
and initialize the Go module.

Commands run:

```bash
mkdir -p backend
mkdir -p frontend
mkdir -p chaincode/institution-cc
mkdir -p chaincode/certificate-cc
mkdir -p network/config
mkdir -p network/deployment
mkdir -p network/templates
mkdir -p network/generated
mkdir -p network/crypto
mkdir -p network/channel-artifacts
mkdir -p network/cmd/blcgen
mkdir -p network/scripts/lib
mkdir -p docker

cd network && go mod init blc/network
```

`.gitignore` added at repo root:

```
network/generated/
network/crypto/
network/channel-artifacts/
```

**Verification:**

```bash
find . -not -path './.git*' -not -path '.' | sort
git status
# sanity check that ignored dirs are actually ignored:
touch network/generated/test.txt network/crypto/test.txt network/channel-artifacts/test.txt
git status --porcelain   # confirmed: none of the three test files appear
rm network/generated/test.txt network/crypto/test.txt network/channel-artifacts/test.txt
```

**Result:** folder tree matches spec; `network/go.mod` created
(`module blc/network`, go 1.25.0); generated/crypto/channel-artifacts
confirmed git-ignored.

**Decisions made before/during this phase** (see `ARCHITECTURE.md` and
project memory `project_blc31_network_decisions` for full detail):
- Custom Fabric network build confirmed over `fabric-samples` test-network,
  despite two planning docs (`docs/BLC_Consortium_Architecture_Proposal_v2.docx`,
  `BLC_Technical_Design_Document_v3.docx`) suggesting test-network.
- Org naming: `BLCFounder` + `InstitutionA` (founding), `InstitutionB`
  (pending) — per the build prompt's schema example, not v3's
  `Institution1/2/3`.

---

## Phase 2 — Config schema

**Goal:** define `network.yaml` (architecture) and `deployment/local.yaml`
(infra) as data, mirror them as Go structs, and write a loader/merge that
joins them by org name.

Commands run:

```bash
cd network
go get gopkg.in/yaml.v3
go build ./...      # after types.go
go build ./...      # after load.go
go run ./cmd/blcgen  # after main.go
```

Files created:
- `network/config/network.yaml` — 3 orgs (BLCFounder, InstitutionA founding;
  InstitutionB pending), channel `blcchannel` (capability V2_5), raft x1,
  chaincode packaging `classic`.
- `network/deployment/local.yaml` — fabric_version 2.5.0, ca_version 1.5.15,
  per-org CA/peer/CouchDB ports (map keyed by org name, deliberately a
  different shape from network.yaml's org list).
- `network/internal/config/types.go` — `NetworkConfig`, `Organization`,
  `DeploymentConfig`, `OrgDeployment`, `MergedOrganization` (embeds both).
- `network/internal/config/load.go` — `LoadNetworkConfig`,
  `LoadDeploymentConfig`, `Merge` (joins by org name, errors if a
  network.yaml org has no matching deployment entry).
- `network/cmd/blcgen/main.go` — loads both configs, merges, prints.

**Verification:** `go run ./cmd/blcgen` (from `network/`) printed all three
organizations with correct MSP/status/ports, matching the source YAML
exactly.

**Result:** Phase 2 exit condition met — merged struct printed correctly
for two founding orgs and one pending org.

**Note:** `Merge` only checks network.yaml → deployment direction (an org
in local.yaml with no network.yaml entry is silently ignored, not an
error). Flagged for Phase 3 to decide whether that should tighten.

---

## Phase 3 — `blcgen validate`

**Goal:** implement real validation checks, wire `validate`/`version`
subcommands into the CLI, and prove the checks work with both a valid and
a deliberately-broken fixture, including automated Go tests.

Commands run:

```bash
cd network
go build ./...
go run ./cmd/blcgen
go run ./cmd/blcgen validate
go run ./cmd/blcgen version
go run ./cmd/blcgen validate --network internal/config/testdata/broken_network.yaml --deployment internal/config/testdata/broken_deployment.yaml
go test ./... -v
```

Files created:
- `network/internal/config/validate.go` — `Validate(net, dep) error`.
  Checks: channel name non-empty; orderer count >=1 and odd if >1; unique
  org names; unique MSP IDs; valid status (`founding|pending|member`);
  every org has a matching deployment entry; all CA/peer/CouchDB ports
  unique across all orgs combined (not just within one port type, since
  they're all host-port mappings on the same machine). Uses
  `errors.Join` to report every problem in one pass, not just the first.
- `network/cmd/blcgen/main.go` — rewritten with subcommand dispatch:
  no-arg default (unchanged from Phase 2), `validate` (with
  `--network`/`--deployment` path overrides, defaults to real config),
  `version` (prints generator version, target Fabric version — read
  live from `deployment/local.yaml`, not hardcoded — and config schema
  version).
- `network/internal/config/testdata/valid_network.yaml` +
  `valid_deployment.yaml` — mirror the real config, used by
  `TestValidate_ValidConfig`.
- `network/internal/config/testdata/broken_network.yaml` +
  `broken_deployment.yaml` — deliberately broken: `InstitutionA` reuses
  `BLCFounderMSP` (duplicate MSP ID), has `status: invalidstatus`
  (invalid status), and its `peer_port: 7051` collides with
  `BLCFounder`'s (duplicate port).
- `network/internal/config/validate_test.go` — `TestValidate_ValidConfig`
  (valid fixture passes), `TestValidate_BrokenConfig` (broken fixture
  fails with all three expected error substrings present).

**Verification:**
- Manual CLI run against the broken fixture printed all three errors
  together, readable, no stack trace/panic, exit status 1.
- `go test ./... -v` — both tests `PASS`, package `ok`.

**Result:** Phase 3 exit condition met — `go test ./...` passes;
`blcgen validate` against the broken fixture prints specific, readable
errors instead of a panic.

---

## Phase 4 — Generate `configtx.yaml`

**Goal:** write the `configtx.yaml` template, render it from real config,
and prove `configtxgen` can build an actual genesis block from the
rendered output with no errors.

**Schema extension mid-phase:** discovered `network.yaml`'s `orderer:`
block had no identity (`name`/`msp`) of its own — every institution org
had one, the orderer didn't. Added `orderer.name: BLCOrderer` and
`orderer.msp: BLCOrdererMSP` to `network.yaml`, and an `orderer:` block
(`ca_port: 6054`, `general_port: 7050`, `admin_port: 7053`) to
`deployment/local.yaml`. Propagated through `types.go` (new fields +
`OrdererDeployment` struct), `validate.go` (orderer name/MSP/ports now
checked the same way institution orgs are — seeded into the same
`seenMSPs`/`seenPorts` maps so collisions with institutions are caught
for free), and all four test fixtures.

**Sequencing gap discovered and resolved:** `configtxgen` cannot build a
genesis block from `configtx.yaml` text alone — it must load real MSP
directories from disk for every organization. That crypto material was
originally scoped to Phase 6 (`network.sh up`). Resolved by pulling a
minimal, reusable CA-enrollment script forward into this phase (see
`bootstrap-crypto.sh` below) — parameterized from config, intended to be
called by Phase 6's `network.sh up` as-is, not thrown away.

Commands run:

```bash
cd network
go build ./...
go run ./cmd/blcgen validate
go run ./cmd/blcgen generate configtx
chmod +x scripts/bootstrap-crypto.sh
bash -n scripts/bootstrap-crypto.sh
./scripts/bootstrap-crypto.sh
find crypto/organizations -type f | sort
export FABRIC_CFG_PATH=$(pwd)/generated
mkdir -p channel-artifacts
configtxgen -profile BLCChannel -channelID blcchannel -outputBlock channel-artifacts/genesis.pb
```

Files created:
- `network/templates/configtx.yaml.tmpl` — single-profile (`BLCChannel`)
  Fabric 2.x channel config, no legacy system channel/`Consortiums`
  section (uses the modern Channel Participation API model). One
  `{{.CapabilityLevel}}` value drives `Channel`/`Orderer`/`Application`
  capabilities together — the direct fix for CBDC's stale-capability bug.
  `AnchorPeers` baked in per founding org (this is why `org-add.sh`,
  Phase 9, must set a pending org's anchor peer as a separate step — it
  was never in this file to begin with).
- `network/internal/generate/data.go` — `TemplateData`/`OrdererTemplateData`/
  `OrgTemplateData`, `BuildTemplateData()`. Filters organizations to
  `founding`/`member` only — `pending` orgs (e.g. `InstitutionB`) never
  appear in a genesis config. Resolves all MSP/TLS paths to absolute
  paths via `filepath.Abs`.
- `network/internal/generate/render.go` — `RenderConfigTx()`, uses
  `text/template` (not `html/template` — no auto-escaping of YAML/paths),
  creates `generated/` if missing.
- `network/cmd/blcgen/main.go` — added `generate configtx` subcommand;
  calls `config.Validate` directly before rendering (fail closed, per
  the frozen "validation is mandatory before generation" rule).
- `network/scripts/bootstrap-crypto.sh` — starts one Fabric CA container
  per org (orderer + each founding/member institution), enrolls an
  `Admin` identity (doubles as CA registrar), registers+enrolls one node
  identity (`orderer0` or `peer0`) with the correct `--id.type` for
  NodeOUs, enrolls a TLS certificate for that node, and assembles each
  org's `msp/` (cacerts + NodeOUs `config.yaml` + admincerts, belt-and-
  suspenders). CA server TLS itself is disabled
  (`FABRIC_CA_SERVER_TLS_ENABLED=false`) to simplify local enrollment —
  unrelated to the real identity certs it issues. Known limitation: not
  idempotent — re-running against still-up CA containers fails on
  "name already in use"; cleanup is deferred to Phase 6's `network.sh
  down`.

**Bug found and fixed:** `data.go` originally hardcoded the orderer's
crypto path segment as the literal string `"orderer"` instead of
`net.Orderer.Name` (`"BLCOrderer"`), while `bootstrap-crypto.sh` correctly
read the name from config. Result: `configtxgen` failed with `cannot load
client cert for consenter localhost:7050: ... organizations/orderer/tls/
signcerts/cert.pem: no such file or directory` — a real demonstration of
why a hardcoded value duplicating a config-driven one is dangerous even
in generator code, not just in the YAML files themselves. Fixed by using
`net.Orderer.Name` in both `MSPDir` and `TLSCertPath`.

**Verification:**
- `find crypto/organizations -type f` confirmed the expected structure
  for all three orgs (org-level `msp/`, node identity, TLS material,
  `Admin` identity).
- `configtxgen -profile BLCChannel -channelID blcchannel -outputBlock
  channel-artifacts/genesis.pb` completed with `Writing genesis block`
  and no `FATA`/error output, after the path bug above was fixed.

**Result:** Phase 4 exit condition met — `configtxgen` successfully
produced a channel genesis block from the generated `configtx.yaml` with
no errors.

---

## Phase 4 rework — production topology (3 orderers, 2 peers/org)

**Goal:** after reviewing a prior project's Fabric topology, the decision
was made to build BLC-31's network at production-grade resilience rather
than single-node MVP scale — see `ARCHITECTURE.md`'s amendment note and
project memory `project_blc31_production_topology` for full rationale.
This reopens Phase 4's already-completed artifacts (crypto enrollment,
`configtx.yaml.tmpl`, generated genesis block) before proceeding to
Phase 5, rather than scaling up later.

**Target topology:** 3 orderer nodes (Raft, tolerates 1 failure — 2 was
considered and rejected since Raft needs a majority and 2 nodes tolerates
zero failures, same as 1), 2 peers per organization (so one peer can
restart/upgrade without taking the org offline). Cloud/Kubernetes
deployment remains explicitly out of scope — this is about the network's
internal shape only.

**Schema design:** rather than adding a redundant peer-count field to
`network.yaml` that must stay in sync with actual ports, peer count per
org and orderer node count are derived from the *length* of the port
list in `deployment/local.yaml` (`orderer.nodes: [...]`, per-org
`peers: [...]`). `network.yaml`'s pre-existing `orderer.count` field is
kept as the one governance-relevant count (consensus size affects the
whole consortium's trust model); `blcgen validate` is extended to check
it matches `len(deployment.orderer.nodes)`. Peer count per org is treated
as pure infra/availability, not governance, so it lives only in
`deployment/local.yaml`.

Commands run:

```bash
cd network
go build ./...
go test ./... -v
go run ./cmd/blcgen validate
go run ./cmd/blcgen generate configtx
docker rm -f ca.BLCOrderer ca.BLCFounder ca.InstitutionA
docker run --rm -v "$(pwd)/crypto:/crypto" hyperledger/fabric-ca:1.5 sh -c "rm -rf /crypto/ca-servers /crypto/organizations"
./scripts/bootstrap-crypto.sh
export FABRIC_CFG_PATH=$(pwd)/generated
configtxgen -profile BLCChannel -channelID blcchannel -outputBlock channel-artifacts/genesis.pb
configtxgen -inspectBlock channel-artifacts/genesis.pb
```

Files changed:
- `network/config/network.yaml` — `orderer.count: 1` → `3`.
- `network/deployment/local.yaml` — orderer's single `general_port`/
  `admin_port` restructured into `nodes: [...]` (3 entries); each org's
  single `peer_port`/`couchdb_port` restructured into `peers: [...]`
  (2 entries each).
- `network/internal/config/types.go` — `OrdererDeployment.Nodes
  []OrdererNodePorts`, `OrgDeployment.Peers []PeerPorts` (replacing the
  old flat single-port fields).
- `network/internal/config/validate.go` — new check: `orderer.count`
  must equal `len(deployment.orderer.nodes)`. Port-uniqueness loops now
  walk every node/peer's ports (labeled `node0.general_port`,
  `peer1.couchdb_port`, etc.) instead of one fixed set per org.
- All 4 test fixtures (`valid_network.yaml`, `valid_deployment.yaml`,
  `broken_network.yaml`, `broken_deployment.yaml`) updated to the new
  shape — the broken fixture's intentional duplicate-port bug preserved
  (`InstitutionA` peer0 now collides with `BLCFounder` peer0, both at
  `7051`).
- `network/internal/generate/data.go` — `OrdererTemplateData.Consenters
  []OrdererConsenter` and `OrgTemplateData.Peers []OrgPeer` replace the
  old single-value fields. TLS cert paths now nest under each node's own
  name (`BLCOrderer/orderers/orderer{0,1,2}/tls/...`) instead of a flat
  per-org path, since there's no longer a single node to keep it flat
  for.
- `network/templates/configtx.yaml.tmpl` — `OrdererEndpoints`,
  `Orderer.Addresses`, and `EtcdRaft.Consenters` now loop over all 3
  nodes; `AnchorPeers` loops over both peers per org.
- `network/cmd/blcgen/main.go` — `printMerged` updated to loop over
  `org.Peers` instead of printing one fixed peer/couchdb port pair.
- `network/scripts/bootstrap-crypto.sh` — `bootstrap_org` now takes a
  `node_count` and loops, registering+enrolling `<type>0..<type>(N-1)`
  identities per org (new `enroll_node` helper factors out the
  per-node register/enroll/TLS steps). Node counts are read from
  `len(deployment.orderer.nodes)` / `len(org.peers)` — never hardcoded.

**Verification:**
- `go test ./... -v` — both tests still `PASS` after the fixture rework.
- `bootstrap-crypto.sh` re-run cleanly after removing the old single-node
  CA containers/crypto (old CA server files were root-owned from the
  container, requiring a throwaway `fabric-ca` container — not `sudo` —
  to remove them) — produced 3 orderer node identities and 2 peer
  identities per org, all enrolled without error.
- `configtxgen -outputBlock` completed with no errors against the new
  topology.
- `configtxgen -inspectBlock` confirmed the genesis block encodes all 3
  orderer consenters (`localhost:7050/7060/7070`) and both anchor peers
  per org (`7051`/`7061` for `BLCFounder`, `9051`/`9061` for
  `InstitutionA`).

**Result:** Phase 4 rework complete — network now reflects
production-grade topology (3 orderers, 2 peers/org), exit condition
re-verified under the new shape.

**Follow-up — `operations_port` added per orderer node:** extended
`OrdererNodePorts` with `OperationsPort` (`9443`/`9453`/`9463`, one per
node — Fabric's own conventional default for node0, stepped by 10 for
the other two, matching `general_port`/`admin_port`'s pattern) and added
it to `validate.go`'s port-uniqueness check. Deliberately **not** added
to `configtx.yaml.tmpl` — the Operations endpoint (Prometheus
metrics/health checks) isn't part of Fabric's channel genesis config at
all; it's a per-node runtime listener set via each orderer's own
environment/config, which is Phase 5/6's concern (docker-compose env
vars), not the generator's. Confirmed via `grep -i operations
generated/configtx.yaml` returning nothing after regenerating. All 4
test fixtures updated with explicit `operations_port` values (needed —
without them every node defaults to port `0`, which the uniqueness
check would then flag as a false collision across all 3 nodes).

---

## Phase 5 — Generate compose, core.yaml, connection profiles

**Goal:** generate Docker Compose files (CA services + orderer/peer/
CouchDB services) for the 3-orderer/2-peer-per-org topology, plus
per-org connection profiles. `core.yaml` deliberately skipped — see
decision below.

**Pre-work fix (caught before writing any Phase 5 files):** Phase 4's
`data.go` hardcoded `Host: "localhost"` for every orderer consenter and
anchor peer in `configtx.yaml`. That only surfaced as a problem once
Phase 5 made the containerized topology concrete — `localhost` inside
one container can never reach another. Changed to each node's Docker
Compose service hostname (`<node>.<Org>`, e.g. `orderer0.BLCOrderer`).
No crypto re-enrollment needed — `bootstrap-crypto.sh` already included
this hostname as a TLS SAN in Phase 4. Regenerated `configtx.yaml` and
re-ran `configtxgen` — genesis block still builds successfully.

**Pre-work fix:** `fabric-ca-client` names TLS private keys and TLS root
CA certs with unpredictable hashes/connection-derived filenames, but
`CORE_PEER_TLS_KEY_FILE`/`CORE_PEER_TLS_ROOTCERT_FILE` (and the orderer
equivalents) need one fixed path. Added two `cp` steps to
`bootstrap-crypto.sh`'s `enroll_node`: copy the keystore file to
`tls/key.pem` and the root CA cert to `tls/ca.pem`, right after TLS
enrollment.

**`core.yaml` — decided to skip generating it.** Every peer setting
needed (MSP path, TLS, gossip, CouchDB address/auth) is fully
expressible via `CORE_PEER_*` env vars, which always take precedence
over `core.yaml`, and the `hyperledger/fabric-peer` image ships a
complete, correct default `core.yaml` already. Hand-authoring a partial
one risked silently missing something env vars don't cover; reproducing
Fabric's real default faithfully was a lot of surface area for no
benefit. Matches `fabric-samples`' own test-network, which is also
100% env-var driven with no custom `core.yaml`.

Files created:
- `docker/peer-base.yaml`, `docker/orderer-base.yaml` — hand-written,
  static Compose fragments (`x-peer-base`/`x-orderer-base` for
  structural settings identical across every node; `x-peer-env`/
  `x-orderer-env` for environment variables, kept as a **separate**
  anchor from the base — see bug below for why).
- `network/internal/generate/compose_data.go` — `ComposeData` and
  `BuildComposeData()`, mirroring `data.go`'s founding/member filter.
  Computes each peer's `GossipBootstrap` (comma-separated addresses of
  every *other* peer in its own org).
- `network/templates/docker-compose-ca.yaml.tmpl` — one CA service per
  org (orderer + founding/member institutions).
- `network/templates/docker-compose-net.yaml.tmpl` — 3 orderer services
  + 2 peer/CouchDB pairs per org, with the hand-written base fragments'
  raw text embedded at the top of the file (YAML anchors only resolve
  within one document, so embedding — not a separate `-f` file — is
  what makes `<<: *peer-base` actually work).
- `network/internal/generate/render.go` — generalized `RenderConfigTx`
  into `Render(data any, ...)`, shared by every generate target instead
  of one function per target.
- `network/cmd/blcgen/main.go` — added `generate compose` subcommand.

**Bug found and fixed — YAML merge keys don't merge colliding list/map
values.** `environment:` was defined in both the hand-written base
fragment and the generated per-node override; `<<:` doesn't concatenate
matching keys, the override just replaces the base's value entirely.
Every orderer/peer would have started with zero TLS config. Caught by
reading `docker compose config`'s actual resolved output line-by-line,
not by any command failing. Fixed by moving `environment` into its own
anchor (`x-peer-env`/`x-orderer-env`) referenced via a *nested*
`<<: *peer-env` inside each service's own `environment:` mapping, where
it's not a colliding sibling key. Full detail in `docs/ERROR_LOG.md`.

**Bug found and fixed — CouchDB credentials hardcoded in two places.**
While fixing a missing `CORE_LEDGER_STATE_COUCHDBCONFIG_*` gap, `admin`/
`adminpw` ended up hardcoded independently in both `docker/peer-base.yaml`
and the CouchDB service block — two unconnected literals that happened
to match. Caught by user review, not a failing command. Fixed by adding
`couchdb_admin_user`/`couchdb_admin_password` to `deployment/local.yaml`
(one global value, not per-org) and referencing it from both the peer's
and the CouchDB container's env vars in the generated file. Full detail
in `docs/ERROR_LOG.md`. **Note:** `admin`/`adminpw` is a local-dev
placeholder, not production-hardened — flagged in `ARCHITECTURE.md`.

**Gap found and fixed — missing `CORE_PEER_GOSSIP_BOOTSTRAP`.** With
only 1 peer per org (the pre-rework MVP shape) this never mattered.
With 2 peers per org, a peer needs at least one org-mate's address to
join its own org's gossip network on startup. Computed per-peer in
`BuildComposeData` (every peer lists every *other* peer in the same
org) and added to the generated environment block.

**Verification so far:**
- `docker compose -f generated/docker-compose-ca.yaml config` — 3 CA
  services, correct ports, no errors.
- `docker compose -f generated/docker-compose-net.yaml config` — 3
  orderer + 4 peer + 4 CouchDB services (11 total), correct merged
  environment (verified the actual resolved TLS/logging vars are
  present, not just that the file parses), correct gossip bootstrap
  (`peer1.BLCFounder` → `peer0.BLCFounder`, `peer1.InstitutionA` →
  `peer0.InstitutionA`), matching CouchDB credentials on both sides.

Additional files created:
- `network/internal/generate/connection_data.go` — `ConnectionProfileData`
  + `BuildConnectionProfiles()`, returning one profile per founding/
  member org, all sharing the same `Orderers` list. Uses `localhost` +
  host-published ports (matching `bootstrap-crypto.sh`'s own host-based
  `fabric-ca-client` addressing) — deliberately different from
  `configtx.yaml`'s Docker-service-hostname addressing, since these
  serve different consumers (external client tooling vs. inter-container
  Raft/gossip). Flagged as needing a docker-network-hostname variant
  later if the backend API ends up running inside the "blc" network
  rather than on the host.
- `network/templates/connection-profile.json.tmpl` — standard Fabric
  connection-profile JSON shape (`client`/`organizations`/`peers`/
  `certificateAuthorities`/`orderers`). CA entries use `http://` (CA
  server TLS is disabled, per Phase 4's `bootstrap-crypto.sh`); peer/
  orderer entries use `grpcs://` with each node's own `tls/ca.pem`.
- `network/cmd/blcgen/main.go` — added `generate profiles` subcommand,
  looping over `BuildConnectionProfiles`' results to write one
  `generated/connection-<org>.json` per org.

**Verification:**
- `go run ./cmd/blcgen generate profiles` wrote exactly 2 files
  (`connection-BLCFounder.json`, `connection-InstitutionA.json`) —
  `InstitutionB` correctly excluded (`pending`).
- Both files confirmed valid JSON via `python3 -c "json.load(...)"` —
  proves the template's comma-placement logic (`{{if $i}},{{end}}`
  idiom) produces syntactically correct JSON, not just something that
  looks right.
- Final full-file validation: `docker compose -f
  generated/docker-compose-ca.yaml config` and the same for
  `docker-compose-net.yaml` both exit clean after every fix made this
  phase (hostname fix, TLS key/cert fixed-name fix, merge-key fix,
  CouchDB credential fix, gossip bootstrap fix).

**Result:** Phase 5 exit condition met — both compose files validate
with no syntax errors; connection profiles generated and confirmed
valid JSON. `core.yaml` generation deliberately skipped (see decision
above).

---

## Phase 6 — `network.sh up`

**Goal:** orchestrate everything built in Phases 1-5 into an actual
running network — start CA containers, enroll identities, generate
remaining artifacts, start orderer/peer/CouchDB containers, create the
channel, join peers, verify anchor peers.

**Pre-work — reconciled `bootstrap-crypto.sh` with `docker-compose-ca.yaml`.**
Phase 5 generated `docker-compose-ca.yaml`, which defines the exact same
3 CA containers `bootstrap-crypto.sh` was separately starting via raw
`docker run` — two independent definitions of the same infrastructure
that would have to be kept in sync by hand. Resolved by design
discussion before writing any code (plan reviewed and confirmed with
user first):

- Deleted the `docker run` block from `bootstrap-crypto.sh`'s
  `bootstrap_org`. Added one `docker compose -f
  generated/docker-compose-ca.yaml up -d` call, once, before the
  per-org enrollment loop — starting all 3 CA containers in parallel
  via compose instead of one-at-a-time via `docker run`.
- `bootstrap-crypto.sh` is now purely "enroll identities against
  already-running CAs" — the CA container's shape (image, env, volumes,
  ports) is defined in exactly one place now: the compose template.
- CA containers are no longer `--rm`/ephemeral — they're normal
  compose-managed services now, which is more correct for a network
  that needs its CAs available long-term (e.g. Phase 9's `org-add.sh`).
  Teardown also gets simpler: `docker compose down` instead of manual
  `docker rm -f` per container.
- Added `require_file` prerequisite check: `bootstrap-crypto.sh` now
  fails closed with a clear message if `generated/docker-compose-ca.yaml`
  doesn't exist yet, instead of a confusing raw `docker compose`
  error.

**Also created `network/scripts/lib/common.sh`** — shared bash
utilities (path constants, `log()`, `require_file()`, an `ERR` trap),
per `ARCHITECTURE.md`'s repo structure. `bootstrap-crypto.sh` refactored
to source it instead of redefining its own path/logging setup
(`log()`'s `$(basename "$0" .sh)` correctly reports the *invoking*
script's name even though the function itself is defined in the sourced
file — confirmed: running `bootstrap-crypto.sh` directly still prints
`[bootstrap-crypto] ...`, not `[common] ...`).

**Verification:**
- Cleaned up old raw-`docker run` CA containers and crypto material,
  regenerated compose files, re-ran `bootstrap-crypto.sh` fresh — clean
  run, `docker compose up` created the `blc` network and started all 3
  CA containers, enrollment proceeded identically to the Phase 4/5 runs
  (3 orderer node identities, 2 peer identities per institution org).
- Regenerated `configtx.yaml` and re-ran `configtxgen` against the
  freshly-enrolled crypto — clean genesis block build, confirming the
  CA-startup mechanism change didn't affect crypto material shape or
  paths at all.

**`network.sh` itself.** Added `scripts/network.sh` with `up`/`down`/
`down --wipe`/`status`. `up` runs 10 numbered stages (validate →
generate compose → bootstrap crypto → generate configtx → build genesis
block → start net compose + wait for ports → generate profiles →
create channel (orderer joins) → join peers → verify membership), with
a dedicated `on_up_error` trap that prints `FAILED at stage N: <name>`
plus whether `down --wipe` is needed before retrying — decided
deliberately as fail-loud-with-manual-wipe rather than building
real idempotency now (stages 3, 8, 9 involve Fabric CA registration /
channel join, both of which reject retrying an already-done action;
stages 1-2-4-5-6-7-10 are safe to retry as-is). Added an orderer-org
Admin TLS enrollment to `bootstrap-crypto.sh` (needed because
`osnadmin`'s admin endpoint requires mutual TLS, per
`ORDERER_ADMIN_TLS_CLIENTAUTHREQUIRED=true` from Phase 5) — confirmed
via Fabric host-tool version check (`peer` v2.5.4 vs. `fabric_version:
2.5.0` — safe, same minor line, patch-only difference) that host CLI
tools don't need to match container image tags exactly.

**Two real bugs found on the first full `network.sh up` run** — full
detail in `docs/ERROR_LOG.md`'s 2026-07-07 "MSP local-MSP bug +
non-existent V2_5 Channel/Orderer capability" entry:
1. Every orderer/peer container crash-looped — each node's own local
   MSP (not just the org-level one) needs NodeOUs config too.
2. After fixing #1, all 3 orderers rejected the channel join — `V2_5`
   doesn't exist as a Channel/Orderer capability in real Fabric (only
   Application has it), verified directly against Fabric's
   `release-2.5` source before changing anything. Fixed by splitting
   `network.yaml`'s capability field into
   `channel.capabilities: {channel, orderer, application}` — nested,
   naming all three real Fabric capability groups explicitly rather
   than one ambiguous shared value.

**Verification:** `go test ./...` passes, `blcgen validate` passes,
regenerated `configtx.yaml` confirmed to show the correct
`V2_0`/`V2_0`/`V2_5` split.

**Third bug found — org-level MSP missing `tlscacerts/`.** Consenter
TLS certs were rejected as "signed by unknown authority" during channel
join, despite being valid — the org-level MSP embedded in the genesis
block never had a trusted TLS root CA cert declared. Fixed by copying
the TLS CA cert from each org's first enrolled node into
`<org>/msp/tlscacerts/`. Full detail in `docs/ERROR_LOG.md`.

**Fourth and fifth bugs — silent stage 9 failure, traced to two causes.**
`network.sh up` reached stage 9 (`peer channel join`) and failed with no
output at all — no error message, no stage-tracking diagnostic, just a
bare exit code. Root causes and fixes, full detail in `docs/ERROR_LOG.md`:
1. Bash's `ERR` trap doesn't propagate into functions without `errtrace`
   (`set -E`), and `create_channel`/`join_peers`/`verify_channel_membership`
   parsed `python3` output via `pipe | while read` — the pipe's
   right-hand side runs in a subshell, so failures there never reached
   `network.sh`'s trap either. Fixed by adding `-E` to `common.sh` and
   converting those three functions to `mapfile` + a plain `for` loop.
2. Once the trap could actually fire, the real error surfaced: the host
   `peer` CLI requires a real `core.yaml` on its config path (unlike the
   containerized peer, which has one bundled in its image) — a scope gap
   in Phase 5's decision to skip generating one. Vendored Fabric's real,
   unmodified `release-2.5` `sampleconfig/core.yaml` into
   `network/peercfg/core.yaml`, and every `peer`/`osnadmin` call in
   `network.sh` now sets `FABRIC_CFG_PATH` explicitly rather than relying
   on the shell's ambient environment (which had a stray leftover export
   from earlier manual testing).

**Sixth bug — wrong CouchDB address env var.** Every peer container
crash-looped, unable to reach its own CouchDB container — the compose
template set `CORE_PEER_COUCHDBADDRESS`, which isn't a real Fabric
setting (the correct one is
`CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS`), so Fabric silently
fell back to its default of `127.0.0.1:5984`. Fixed in
`docker-compose-net.yaml.tmpl`. Full detail in `docs/ERROR_LOG.md`.

**Seventh bug — CA bootstrap identity used directly as org Admin.**
`peer channel join` was rejected by every peer's own policy check:
"The identity is not an admin under this MSP ... does not contain OU
[ADMIN]". `bootstrap_org` had been enrolling the Fabric CA's own
bootstrap identity (type `client` by default) directly as the org's
Admin — its cert could never carry `OU=admin` regardless of NodeOUs
config, since OU comes from the identity's type at *registration*, not
from config.yaml. Fixed by using the bootstrap identity only as an
internal registrar (`crypto/ca-bootstrap/<org>/`) and registering+
enrolling a separate `orgadmin` identity with `--id.type admin` for
actual use as the org's Admin — matching `fabric-samples`' own pattern.
Full detail in `docs/ERROR_LOG.md`.

**Final verification — full clean run, all 10 stages:**

```bash
./scripts/network.sh down --wipe
./scripts/network.sh up
```

All 10 stages completed with no errors: config validated, compose
files generated, crypto enrolled for all 3 orgs, `configtx.yaml`
rendered, genesis block built, all 14 containers (3 CA + 3 orderer + 4
peer + 4 CouchDB) started and reachable, 2 connection profiles
generated, all 3 orderers joined the channel
(`Status: 201`, `"status": "active", "height": 1"` each), all 4 peers
(`peer0`/`peer1` × `BLCFounder`/`InstitutionA`) joined without error,
and both orgs' `peer0` confirmed channel membership at
`{"height":1,"currentBlockHash":"VJxSFO2ZaJyDhSbyt47Jol2FFnmweuy3vI7xh7xqAUQ="}`
— identical hash on both, confirming they're genuinely on the same
channel/block, not two independent ledgers that happen to look similar.

**Result:** Phase 6 exit condition met — `network.sh up` runs end-to-end
from a clean state (`down --wipe`) through all 10 stages with no manual
intervention, producing a running 3-orderer/2-org (2 peers each) Fabric
network with the channel created and joined by every founding/member
organization.

**Post-verification gap found and fixed — stage 10 only checked
`peer0` per org.** With 2 peers/org, verifying only `peer0` never
actually confirmed `peer1` joined at all, and more importantly never
exercised the Phase 5 gossip-bootstrap fix
(`CORE_PEER_GOSSIP_BOOTSTRAP`) — `peer1` isn't an anchor peer, so its
channel state depends on gossiping with `peer0` within its own org.
Fixed `verify_channel_membership` in `network.sh` to loop over every
peer per org (matching `join_peers`' own enumeration pattern), not just
index 0. Re-ran against the already-up network (stage 10 is read-only
and safe to re-run) — all 4 peers (`peer0`/`peer1` ×
`BLCFounder`/`InstitutionA`) now confirmed at identical height/hash.

**Also hit one false-alarm failure worth flagging** — a `down --wipe && up`
re-run failed at stage 9 with no code involved: the host was under
severe memory pressure from unrelated desktop applications, not from
the Fabric containers themselves. Full write-up in `docs/ERROR_LOG.md`
(kept separate from the 7 real bugs above, since diagnosing it again
from scratch next time would be wasted effort — `free -h`/`swap` should
be the first check, not the last, when a previously-working script
suddenly fails with no error output).

---

---

## Phase 7 — Deploy `institution-cc`

**Goal:** implement institution-cc's governance chaincode (Institution/
Proposal/Vote ledger model, `RegisterInstitution`/`ProposeNewMember`/
`CastVote`/queries) per the spec in `BLC_Technical_Design_Document_v3.docx`
section 2.1, deploy it to the running network, and smoke-test via the
peer CLI.

**Design review before writing any code — `RegisterInstitution`'s
access control.** The design doc specifies `RegisterInstitution`'s only
validation as "institution must not already exist" — no restriction on
*who* can call it. Before implementing, walked through exactly who
calls it and when: each founding org self-registers once at genesis
(institutionId is derived server-side from the caller's MSP ID via
`cid.GetMSPID()`, never a client-supplied parameter, so an org can never
register itself as another org's identity); a *later* institution never
calls `RegisterInstitution` at all — per the spec, `CastVote` itself
creates the Institution asset for an approved applicant. This exposed a
real gap: nothing in the spec stops a new org from bypassing governance
entirely by calling `RegisterInstitution` directly the moment it's
added to the channel, if `org-add.sh` were ever run before that org's
membership proposal had actually passed a vote.

**First proposed fix, rejected:** gate `RegisterInstitution` on
"succeeds only if zero Institution assets exist yet" (a bootstrap-only
window). This has a real bug for BLC-31 specifically: there are **two**
founding orgs, not one. Whichever org self-registers first makes the
"zero exist" condition false, which would then permanently block the
*second* founding org from ever registering. A global count is the
wrong check for a multi-founder consortium.

**Final design:** add `InitLedger(foundingMSPIDs []string)`, invoked
exactly once via Fabric's `--init-required`/`--isInit` chaincode
lifecycle mechanism at first commit. `chaincode.sh` derives the argument
list from `network.yaml`'s orgs with `status: founding` (BLCFounder,
InstitutionA) — config-driven, not hardcoded. `RegisterInstitution` then
checks caller-MSP membership in that stored list (not a ledger count),
so both founding orgs can register in either order without blocking
each other, and no org outside the list can ever succeed regardless of
channel-membership timing.

**Two follow-up questions verified against Fabric's actual source
before trusting the design** (not memory — same discipline as the
`V2_5` capability check in Phase 6):
1. *Is the founding list genuinely immutable once set?* Not by platform
   guarantee — nothing in Fabric prevents a future chaincode *upgrade*
   from deploying code that writes to any key, including this one. The
   real protection is two-layered: `InitLedger` itself refuses to
   overwrite the key if it already exists (the technical guard), and
   deploying any different code that omitted that check would still
   require the same multi-org endorsement/approval process as any
   chaincode commit (the governance guard). Nothing in any chaincode is
   ever more protected than that — MSP-based multi-org approval is the
   actual trust boundary here, not a special immutable-data feature
   Fabric doesn't have.
2. *Does `--isInit` only ever fire once, or can an upgrade re-trigger
   it?* Checked Fabric 2.5's real enforcement code
   (`core/chaincode/chaincode_support.go`'s `CheckInvocation`): Fabric
   stores one reserved key per chaincode namespace holding the
   **version string** active when Init last succeeded, and only allows
   skipping Init if that matches the *current* definition's version.
   `core/chaincode/lifecycle/lifecycle.go`'s own layout docs confirm
   `InitRequired` is stored **per sequence** (each commit/upgrade
   independently). Conclusion: yes, an upgrade that bumps the version
   string (routine) and sets `--init-required=true` again **will**
   re-trigger Init. This confirms the founding-list guard cannot rely
   on Fabric's built-in Init gate at all (it's scoped to "per version,"
   not "ever") — it must be, and is, the explicit existence check in
   `InitLedger` itself.
**Sources:** https://raw.githubusercontent.com/hyperledger/fabric/release-2.5/core/chaincode/chaincode_support.go ,
https://raw.githubusercontent.com/hyperledger/fabric/release-2.5/core/chaincode/lifecycle/lifecycle.go

**Documented deviation from the design doc — `proposalId`/`certificateId`
are not literal UUIDs.** `BLC_Technical_Design_Document_v3.docx` specifies
both as "UUID — generated by chaincode." A literal random-UUID library
call (e.g. `uuid.New()`) inside chaincode is a real correctness bug for
this project's specific topology, not a style choice: Fabric requires
every endorsing peer to independently execute a transaction and produce
byte-identical results for the endorsement policy to be satisfied.
BLC-31's endorsement policy requires both orgs to endorse, and each org
runs 2 peers — a randomly-generated UUID would differ per peer,
mismatching read/write sets and failing endorsement. This would likely
pass a naive single-peer dev test and only fail once tested against the
real multi-peer, multi-org topology this project deliberately built in
Phase 4's rework. Using `ctx.GetStub().GetTxID()` instead is
deterministic by construction (fixed by the signed proposal before
simulation starts, identical across every endorsing peer) and still
globally unique per transaction — but it is not UUID-*formatted*, so the
implementation intentionally disagrees with the design doc's literal
wording here. Flagged explicitly rather than silently resolved, per this
project's standing rule (see the test-network vs. custom-network
conflict entry in `docs/ERROR_LOG.md`, 2026-07-06).

**`CastVote`'s rejection path — three options compared, one implemented.**
The design doc lists `rejected` as a valid `MembershipProposal` status but
never specifies when a proposal actually becomes rejected — only the
approval case is defined ("if majority reached: ..."). Without a
rejection path, an unpopular proposal simply stays `open` forever, no
matter how decisively it fails. Three candidate trigger conditions were
compared, all reusing the ledger fields `MembershipProposal` already
tracks (`VotesFor`, `VotesAgainst`, `TotalEligibleVoters`) — no new
schema needed for any of them:

1. **All-votes-in:** reject once every eligible voter has voted and
   `VotesFor` is still short. Requires 100% participation to ever
   resolve — a single abstaining institution stalls the vote forever,
   and that risk grows as the consortium grows, not shrinks.
2. **Explicit reject-threshold:** reject once `VotesAgainst` reaches the
   same majority formula used for approval. Has a real stuck-vote bug at
   *even* voter counts: worked the math for `N=2` (BLC-31's actual first
   real vote — BLCFounder + InstitutionA deciding on InstitutionB) and a
   1-yes/1-no split never reaches either threshold, with no third voter
   left to break the tie. The two threshold formulas only coincide for
   odd `N`; `N=2` is exactly where this breaks.
3. **Majority-unreachable (implemented):** after each vote, compute the
   best-case remaining outcome (`remainingVoters = TotalEligibleVoters -
   VotesFor - VotesAgainst`, `maxPossibleYes = VotesFor +
   remainingVoters`) and reject the instant even that best case falls
   short of the approval threshold. Structurally cannot stall regardless
   of `N` or participation, and — verified separately, not just assumed
   — cannot resolve prematurely either: `maxPossibleYes ≥ required` and
   "approval is still reachable" are definitionally the same statement,
   so the rejection check can only ever fire once approval is
   mathematically impossible, not merely unlikely. Confirmed by tracing
   a maximally-tense alternating vote at `N=6` (`requiredVotesToApprove =
   4`) all the way to the final vote in both directions, including two
   votes landing *exactly* on the threshold (not above it) and correctly
   staying open rather than resolving early.

**Tradeoff accepted, not overlooked:** Option 3 (implemented) can resolve
a proposal before every institution has cast a vote — the first
dissenting vote that makes the outcome mathematically certain ends the
vote immediately, even if other institutions never got the chance to
formally register a position. This was weighed directly against Option
1 (all-votes-in), which preserves full participation but reintroduces a
stall risk from simple non-participation that gets worse, not better,
as the consortium scales. Decided in favor of liveness (a vote that
provably always resolves) over guaranteed full participation.

**Once resolved, `CastVote` rejects further votes outright** ("proposal
is not open") rather than accepting late votes for audit-trail
completeness — this required no new code, since the existing
`proposal.Status != proposalStatusOpen` guard (already used for the
approved case) applies uniformly to `rejected` too. Accepting late votes
would have needed new branching logic (record the vote without
re-evaluating an already-decided outcome) for marginal benefit: a failed
`CastVote` invocation commits nothing to the ledger at all (Fabric
transactions are all-or-nothing), so a rejected late-vote attempt leaves
no trace either way.

**Full trace confirming the implementation, `N=2`** (BLCFounder +
InstitutionA are the only active institutions; InstitutionA has already
called `ProposeNewMember` for `InstitutionBMSP`, giving `TotalEligibleVoters:
2`, `requiredVotesToApprove: 2`):

1. BLCFounder calls `CastVote("tx1", "no")`. All caller/status/applicant
   checks pass; no prior vote from BLCFounder exists.
2. `Vote` asset written (`VoteID: "tx1~BLCFounderMSP"`, `Decision: "no"`).
3. `proposal.VotesAgainst++` → `VotesFor: 0, VotesAgainst: 1`.
4. Approval check: `0 >= 2`? No.
5. Rejection check: `remainingVoters = 2-0-1 = 1`, `maxPossibleYes = 0+1
   = 1`. `1 < 2`? Yes.
6. `proposal.Status = "rejected"`, `ResolvedAt` set, written to the
   ledger. **Resolved after a single vote — InstitutionA's opinion was
   never solicited**, an explicitly-accepted consequence of prioritizing
   liveness (see tradeoff above), not an oversight.
7. InstitutionA later calls `CastVote("tx1", "yes")`, unaware it's
   resolved. Proposal is fetched with `Status: "rejected"`. The
   `Status != open` guard fires immediately: `error: proposal tx1 is not
   open (status: rejected)`. No `Vote` asset is written for this
   attempt — the transaction fails before any `PutState` call, and
   Fabric commits nothing from a failed invocation.

**Test suite — 25 tests across all seven functions, run in the order
reviewed** (`InitLedger` → `RegisterInstitution` → `ProposeNewMember` →
`CastVote` → queries), each confirmed passing before moving to the next.
No mocking framework — `chaincode/institution-cc/mocks_test.go` hand-rolls
a fake `shim.ChaincodeStubInterface` and `cid.ClientIdentity` by embedding
the (nil) interfaces and overriding only the methods this chaincode
actually calls. Two Fabric semantics are modeled precisely, not
approximately, because specific tests depend on both: `GetState` sees
this transaction's own pending writes ("read your own writes"), while
`GetQueryResult` only ever scans previously-*committed* state, matching
real CouchDB's inability to see a transaction's own uncommitted writes —
the exact property `approvingVoters`' before-not-after query ordering
depends on. A `commit()`/`mustFail()` helper pair enforces Fabric's
all-or-nothing rule at the test-fake level too: a failed call's pending
writes are simply never merged into committed state, and `mustFail`
asserts this directly rather than assuming it.

**Both the N=2 and N=6 `CastVote` traces from above are real test
cases**, not just narrative: `TestCastVote_N2_SingleNoVoteRejectsImmediately`
and the two `TestCastVote_N6_CloseRace_*` tests replay the exact vote
sequences and assert the exact intermediate states (including votes 4
and 5 at N=6 landing *exactly* on the threshold and correctly staying
open, not resolving early).

**A genuinely non-obvious finding surfaced while writing the
applicant-cannot-vote-on-its-own-proposal test.** The first attempt
constructed this scenario through the normal flow — inject InstitutionB
as active, then call `ProposeNewMember` for it — and it failed
immediately, but not on the guard being tested: `ProposeNewMember`
itself refused, since InstitutionB was already a member. Working through
why revealed this is not a test-setup quirk but a real structural fact
about the system: **a non-founding institution can only ever become
active by its own membership proposal being approved, and approval
creates its `Institution` asset in the same transaction that closes that
same proposal (`CastVote`'s atomicity, established earlier in this
Phase). There is no code path in which an institution is simultaneously
active and the subject of a still-open proposal about itself** — meaning
`CastVote`'s explicit "applicant cannot vote on its own proposal" check
is unreachable through the real system as built today. It remains
worth keeping as defense-in-depth (it protects against this invariant
ever changing later, e.g. if a second path to activation is added), but
the test for it (`TestCastVote_ApplicantCannotVoteOnOwnProposal`)
necessarily constructs the scenario via direct ledger injection rather
than the real flow, and says so in its own doc comment. Recorded here
because "this specific guard can never actually fire given the rest of
the system" is exactly the kind of fact that's easy to lose once it's
only implicit in a test file, and useful to know before assuming every
written check is load-bearing today.

**`chaincode.sh` written, then blocked on deploying institution-cc —
classic packaging is incompatible with this host's Docker Engine.**
First run failed at stage 1 (`peer lifecycle chaincode package`) with
`Config File "core" Not Found` — a real bug, missing `FABRIC_CFG_PATH`
on that one specific `peer` call (every other call in the script had it;
this one was simply missed). Fixed and re-ran.

Second run got past packaging into stage 2 (install), failing with
`docker build failed: docker image build failed: write unix
@->/run/docker.sock: write: broken pipe` — the peer's own internal
"classic" golang builder building a chaincode Docker image via a
nested `/var/run/docker.sock` bind mount. Diagnosed in stages, each
hypothesis tested rather than assumed:
1. *Missing base image?* `hyperledger/fabric-baseos:2.5` was absent
   locally; pre-pulled it. Identical failure, same point, same error.
2. *No vendored dependencies, forcing a network-dependent `go mod
   download` inside a memory-capped (2GB) ephemeral build container?*
   Ran `go mod vendor`, confirmed `-mod=vendor` build/tests still pass.
   Identical failure again — same point, same error, this time in only
   15s instead of the previous ~48s (ruling out a slow network fetch as
   the delay's cause too).
3. *Genuine version incompatibility.* The peer's own container logs
   showed **zero error-level output from dockerd itself** — `journalctl
   -u docker` (corrected to this host's IST timezone, since the peer's
   logs are UTC) showed only a normal container-task-delete event at the
   exact failure timestamp, as if dockerd considered the request
   already handled/closed, not rejected. Combined with the failure
   always occurring on a *write* (not a read) — consistent with the
   server closing its read side before the client finished sending —
   this pointed at a protocol-level mismatch rather than a resource or
   dependency problem. Confirmed directly: a minimal isolation test ran
   a trivial `docker build` from inside a container using the *official,
   modern* `docker:latest` CLI image, through the exact same bind-mounted
   socket — it succeeded immediately, and its own output
   (`building with "default" instance using docker driver`, `#1`/`#2`
   step numbering) is BuildKit's signature format. Conclusion: this
   Docker Engine version builds fine for a modern client; Fabric
   2.5.0's bundled Docker client library (circa 2021-2022, predating
   BuildKit-only daemons) is what can't complete a build against it.
   This is a genuine, confirmed incompatibility between this specific
   Fabric release and this specific (very new) Docker Engine — not
   something fixable by tuning our own scripts, chaincode, or config.

**Decision: migrate to ccaas now, not later — flagged as a deviation,
not silently absorbed.** This lands on exactly the fork
`ARCHITECTURE.md`'s decision #6 already named as a future migration
("MVP uses classic; ccaas is the documented production migration
path") — just forced sooner than planned. Presented three real options
(switch to ccaas now; downgrade the host's Docker Engine to a
Fabric-2.5-era version; investigate a possible `daemon.json`
compatibility flag, unverified) with honest tradeoffs for each — chose
ccaas: it's the more robust, production-realistic approach regardless
of this specific incompatibility, and doesn't touch shared host
software the way a Docker Engine downgrade would. Full detail and the
ARCHITECTURE.md amendment recording this deviation are cross-linked
there (2026-07-09 entry).

**Verified the exact mechanics before implementing, not guessed:**
- Fetched Fabric's own `cc_service.md` docs on running chaincode as an
  external service, confirming `shim.ChaincodeServer{CCID, Address, CC,
  TLSProps}` is the Go-side API, and that `CCID` must exactly match the
  package ID assigned at install time.
- Confirmed via `go doc` that `contractapi.NewChaincode()`'s return type
  (`*ContractChaincode`) already implements `shim.Chaincode`'s
  `Init`/`Invoke` methods — so it plugs directly into
  `ChaincodeServer.CC` with no chaincode logic changes, only `main.go`.
- Fetched Fabric's own official reference script
  (`fabric-samples/test-network/scripts/deployCCAAS.sh`) for the exact
  verified command sequence, rather than improvising one. Key finding:
  `peer lifecycle chaincode calculatepackageid` computes the package ID
  **locally and deterministically** (label + content hash) — no install
  needed first — which cleanly resolves the apparent chicken-and-egg
  problem (the running chaincode server needs to know its own package
  ID, but the package ID was assumed to only be knowable after
  installing). Also confirmed the reference script bypasses `peer
  lifecycle chaincode package` entirely for ccaas packages (hand-rolls
  the tarball) — checked why: `PackageInput.Type` flows straight from
  `--lang` into `metadata.json`, but `PackageChaincode`'s
  `PlatformRegistry` only recognizes registered platforms (golang/node/
  java/car) — "ccaas"/"external" isn't one, so `--lang ccaas` would be
  rejected. Followed the verified, working approach rather than gambling
  on an untested shortcut.
- Verified `hyperledger/fabric-peer:2.5.0` already ships a built-in
  `ccaas_builder` external builder (confirmed directly from this
  project's own vendored `core.yaml` and from the peer's own logs during
  the classic-packaging failures, which showed `ccaas_builder`'s
  `detect` step correctly declining a `type: golang` package) — no
  peer/`core.yaml` changes needed at all, only correct packaging
  (`metadata.json`'s `"type": "ccaas"`).

**One deliberate deviation from the reference script, with reason:**
`deployCCAAS.sh` packages the chaincode **once**, using a literal
unresolved `{{.peername}}` placeholder in its `connection.json` address
— apparently an incomplete illustration rather than a fully generalized
multi-org implementation. This project's actual topology (2 peers per
org, sharing their own org's chaincode service instance) genuinely
needs a **different `connection.json` per org** (a different address
per org), which means a different package — and therefore a different
package ID — per org. Fabric's lifecycle model explicitly allows
approving orgs to use different package IDs for the same chaincode
definition (only name/version/sequence need to match across orgs), so
this is a correct adaptation, not a shortcut: `chaincode.sh` packages,
computes the package ID, and installs once **per org**, not once
globally.

**Implementation:**
- `chaincode/institution-cc/main.go` rewritten around
  `shim.ChaincodeServer`, reading `CHAINCODE_ID`/
  `CHAINCODE_SERVER_ADDRESS` from the environment — identical binary
  across every org's container, only those two env vars differ.
- `chaincode/institution-cc/Dockerfile` added: multi-stage build from
  the already-vendored `vendor/` directory (no network access needed
  during image build — deliberately removing network flakiness as a
  variable, not just the original Docker incompatibility).
- `network/scripts/chaincode.sh` rewritten end to end around the
  verified sequence: build the ccaas image once (plain host `docker
  build`, never through any peer-internal path) → package + install +
  approve **per org** (each with its own package ID) → check commit
  readiness → commit (shared name/version/sequence) → start each org's
  ccaas container via `docker run --network blc` (Docker's bridge
  network already gives container-name-based DNS resolution, so
  `institution-cc.<org>:9999` resolves correctly without any compose/
  `blcgen` changes) → init.
- Deliberately did **not** add ccaas services to
  `docker-compose-net.yaml.tmpl` or any new `network.yaml`/
  `deployment/local.yaml` schema fields: `CHAINCODE_ID` is only known
  *after* packaging, long after compose files are generated once at
  network bring-up — baking it into a template would need awkward
  shell-variable-escaping tricks inside Go template syntax for no real
  benefit. `docker run`/`docker rm` directly from `chaincode.sh` is
  simpler, matches Fabric's own reference script exactly, and keeps the
  blast radius of this migration contained to the chaincode + one
  script, touching zero existing generator code.
- Verified each new piece in isolation before wiring it together:
  `go build -mod=vendor`/`go test -mod=vendor` still pass after the
  `main.go` rewrite; the Docker image builds cleanly; a smoke-test
  container starts and stays up without crashing given valid
  `CHAINCODE_ID`/`CHAINCODE_SERVER_ADDRESS`.

**First real deployment run — two more real bugs found, both in
`chaincode.sh`/chaincode logic, neither in the ccaas design itself.**
Stages 1-5 (build, package/install/approve per org, checkcommitreadiness,
commit, start containers) succeeded cleanly on the first attempt.

1. **`package_and_install_for_org`'s progress logging corrupted its own
   return value.** `log()` writes to stdout by default; this function's
   stdout is ALSO the caller's return channel for the package ID
   (captured via `$(...)`). Every `log "..."` call inside the function
   got captured too, producing a multi-line garbled string instead of a
   clean package ID — visible directly in the terminal output as `log`
   lines interleaved mid-value. The install itself worked (it used the
   correct value from its own local scope), but both `approve_for_org`
   and `start_ccaas_container` received the corrupted value externally.
   Silent at approve/commit time (Fabric doesn't validate that an
   approved package ID is real at approval time — only at actual
   invocation), only surfacing at the init step: `chaincode definition
   for 'institution-cc' exists, but chaincode is not installed`.
   **Fix:** redirect this function's own `log` calls to `>&2` explicitly
   — `log()` itself is unchanged (every other caller elsewhere still
   uses plain stdout correctly, since they don't have this
   return-via-stdout pattern).
   **Recovery for the already-committed deployment** (not a re-run from
   scratch — sequence 1 was already correctly committed; only the
   per-org approval's package-id association was wrong): restarted both
   ccaas containers with the correct `CHAINCODE_ID`, then re-approved
   both orgs with the correct package ID. Confirmed Fabric allows
   re-approving an already-committed sequence — the channel-level
   definition only tracks name/version/sequence, never package IDs, so
   this doesn't require a new commit or a sequence bump. (This is the
   same mechanism Phase 9's `org-add.sh` will need for a newly-joined
   org to approve an already-committed chaincode.)

2. **`InitLedger`'s arguments were word-split instead of JSON-encoded.**
   `InitLedger(foundingMSPIDs []string)` takes one `[]string` parameter.
   contractapi's convention: each `Args` array element maps to exactly
   one Go parameter, by position — for a slice parameter, that ONE
   element must itself be a JSON-encoded array string. The invocation
   example computed `FOUNDING_MSPS` as a space-joined string and passed
   it unquoted, so bash word-split it into two separate `Args` elements
   (`"BLCFounderMSP"`, `"InstitutionAMSP"`) instead of one
   (`["BLCFounderMSP","InstitutionAMSP"]`), failing with `Conversion
   error. Value BLCFounderMSP was not passed in expected format
   []string`. **Fix:** compute the argument as a JSON array via Python's
   `json.dumps` and pass it as one quoted shell argument. `chaincode.sh`
   itself needed no code change — its generic Args-building logic
   (`--init-args` → one `Args` element per value, correct for the more
   common case of multiple simple positional parameters) was already
   right; only the *invocation example* in the script's own header
   comment was wrong, and got corrected there too.

3. **A genuine chaincode bug, not a deployment issue:**
   `RegisterInstitution`'s response failed contractapi's own
   post-execution schema validation — `Error handling success response.
   Value did not match schema: 1. return: approvedBy is required` — even
   though `Institution.ApprovedBy` has Go's `json:"...,omitempty"` tag
   and is legitimately unset for a founding registration (there's no
   "who voted for it" list). Root cause, confirmed by reading
   `fabric-contract-api-go`'s own `metadata/schema.go`: contractapi
   generates its response schema from a SEPARATE `metadata` struct tag,
   not `json` — every field defaults to `required: true` in that schema
   unless `metadata:"name,optional"` says otherwise. `omitempty` only
   controls JSON marshaling; it has no effect on contractapi's own
   schema-required-ness. Found and fixed both affected fields
   (`Institution.ApprovedBy`, `MembershipProposal.ResolvedAt` — the
   latter caught proactively by searching for every other `omitempty`
   field in `model.go`, not waiting to hit the identical failure again
   on `GetProposal`/`ProposeNewMember` later). Rebuilding and restarting
   the ccaas containers was sufficient to pick up the fix — no
   re-package/install/approve/commit needed, since the package ID is
   tied only to `connection.json`, never to the actual chaincode binary,
   a direct benefit of the ccaas architecture over classic packaging.

**Final smoke test, after both fixes — all via `peer chaincode
invoke`/`query` against the live network:** `InitLedger` (both founding
MSPs) succeeded. `RegisterInstitution` succeeded for both
`BLCFounderMSP` and `InstitutionAMSP`, each returning the correct
`Institution` JSON. `GetAllInstitutions` initially returned `[]`
immediately after the second registration — confirmed via `peer channel
getinfo` (block height correctly at 8, both transactions had landed) to
be an ordinary commit-timing lag (the query ran before the block
finished committing), not a bug; retrying moments later returned both
institutions correctly. Phase 7 exit condition met:
`institution-cc` is packaged, installed, approved, committed,
initialized, and its full governance read/write path is confirmed
working end to end on the live network.

**Repeatability check, run deliberately before calling Phase 7 done** —
the ccaas migration was a mid-flight architectural change, exactly the
kind of thing that can leave a "works now but only because of leftover
state" risk, the same failure mode caught during Phase 6's own
repeatability pass. `./network.sh down --wipe` was run to confirm the
whole stack (network + ccaas chaincode) comes up clean from nothing, not
just that it currently works.

It did not come up clean on the first attempt. `docker compose down`
logged `Network blc Resource is still in use` and the `blc` network
survived the wipe, because `institution-cc.BLCFounder`/
`institution-cc.InstitutionA` were still running — `chaincode.sh` starts
ccaas containers with a plain `docker run --network blc`, invisible to
docker-compose, and had no teardown verb of its own. See
`docs/ERROR_LOG.md`'s matching entry for the full diagnosis.

**Fix:** added `chaincode.sh teardown`, generic across both the
chaincode-name and org dimensions (chaincode names discovered from
`chaincode/*`'s directory listing, orgs from `network.yaml` via the
existing `active_org_lines` helper — no hardcoded
`institution-cc`/`BLCFounder`/`InstitutionA`, matching every other loop
in this script), and wired it into `network.sh`'s `cmd_wipe` to run
*before* either `docker compose down` call, so containers detach from
`blc` before compose tries to remove it. Worth noting as a validation of
the generic-discovery design, not just the fix itself: running it
uncovered `certificate-cc.BLCFounder`/`certificate-cc.InstitutionA`
containers that were running from an earlier, untracked experiment —
found and removed purely by scanning `chaincode/*`, with no prior
knowledge that Phase 8's chaincode name even had containers to clean up.

**Re-ran the full check from scratch after the fix:** `network.sh down
--wipe` (network ID changed from `a0cecff49b23` to `6fa98c1264f1`,
confirming a genuinely new network, and this time logged `Network blc
Removed`, not "still in use") → `network.sh up` → `chaincode.sh deploy
institution-cc --init-function InitLedger --init-args
"$FOUNDING_MSPS_JSON"` (all 6 stages clean, no `FAILED at stage N`) →
smoke test. Every container's `CreatedAt` timestamp fell within the same
minute as the fresh bootstrap, ruling out anything reused. Final
`GetAllInstitutions` query (after the same commit-timing lag seen the
first time — an ordinary retry, not a new bug) returned both
`BLCFounderMSP` and `InstitutionAMSP` as `active` institutions. Phase 7
is now verified the same way every other phase in this build has been —
against a fresh teardown and rebuild, not on the strength of "it worked
once."

**Deferred, not fixed:** plain `network.sh down` (no `--wipe`) has the
identical exposure — same `docker compose down` call, same silent
network-removal no-op if a ccaas container is still running — but wasn't
in scope here since it didn't break wipe's clean-slate guarantee. Should
be wired to the same `chaincode.sh teardown` call before Phase 9's
`org-add.sh` work leans on `down` being fully clean.

**Addendum (2026-07-09) — external validation of the
`requiredVotesToApprove` design.** The team's own sprint-planning notes
(a separate informal planning doc, not the technical design doc)
explicitly flag the 66%-vs-majority threshold as a deliberately
postponed decision: "we want it but we don't need it at stage of two
institutions... [changing it later] seems not complicated." This is
exactly the scenario `requiredVotesToApprove` was built for — a single
named function implementing the threshold formula (currently
`totalEligibleVoters/2 + 1`), documented in its own comment as swappable
to a supermajority in one place rather than a magic number scattered
across `CastVote`. The planning doc's own expectation (cheap to change
later) matches the design's actual cost to change (one function body,
no ledger or schema changes) — logged here as confirmation the
swappable-threshold approach was the right call, not a speculative
abstraction built ahead of need.

---

## Phase 8 — Deploy `certificate-cc`

**Scope confirmed against the team's actual sprint planning, not just
the technical design doc.** `BLC_Technical_Design_Document_v3.docx`
section 2.2 specifies exactly four functions —
`IssueCertificate`, `VerifyCertificate`, `GetCertificate`,
`GetCertificatesByInstitution` — with no `RevokeCertificate` anywhere,
despite `Certificate.status` listing `revoked` as a valid value (the
same shape of gap as `institution-cc`'s `proposalStatusRejected`: a
status value with no reachable code path). Cross-checked against the
team's separate sprint-planning notes (v1.0 = consortium creation and
vetting, v1.01 = licensing, both reviewed 2026-07-09) — revocation
appears in neither sprint. **`RevokeCertificate` is not yet scoped by
the team** — not implemented in this phase, and not a design ambiguity
being resolved unilaterally. Proceeding with exactly the four functions
above; `Certificate.status` will only ever be written as `"active"` in
this phase.

**Phase 9 dependency flagged now, not left implicit.**
`IssueCertificate`'s caller check has to ask `institution-cc` whether the
caller is an active institution, via
`ctx.GetStub().InvokeChaincode("institution-cc", ...)`. Per
`fabric-chaincode-go/shim/interfaces.go`'s own documentation of that
call, chaincode-to-chaincode invocation is **peer-local** — it requires
the invoked chaincode to actually be installed on whatever peer is asked
to endorse the calling chaincode's transaction. That already holds for
both founding orgs today, since `chaincode.sh` installs every chaincode
on every founding/member org's peers. It will **not** automatically hold
for a third institution joining later: `org-add.sh` (Phase 9)'s own
scope, per `ARCHITECTURE.md`, is fetch channel config → decode → inject
MSP → collect signatures → submit config-update → set anchor peer —
channel membership only, no chaincode installation step at all. A newly
joined org would be a channel member unable to successfully call either
chaincode (`certificate-cc`'s own functions, or anything that reaches
into `institution-cc`) until both are separately installed and approved
for its org. Flagged here, before Phase 9 is written, so this is a
requirement its design starts from, not a gap found mid-implementation.

**Design review before writing `IssueCertificate` — resolved via Slack,
not assumed.** Asked Szymon directly whether "the consortium approves
list of certificates" (planning notes) meant unilateral issuance with
automatic numbering, or per-certificate multi-institution voting —
structurally different chaincodes. His answer: "Both institutions sign
that certificate is legitimate. Certificate issuance don't require
second institution to issue." — ruling out voting, but raising a new
question: is "both institutions sign" a chaincode-level requirement
(a new `CoSignerID`/`Signatures[]` field) or already satisfied by
something else?

Verified against Fabric's actual source rather than assumed: the
channel's Application default endorsement policy
(`configtx.yaml.tmpl`) is `Endorsement: ImplicitMeta "MAJORITY
Endorsement"`. Fetched Fabric's own implementation
(`common/policies/implicitmeta.go`, `release-2.5` branch):
`threshold = len(subPolicies)/2 + 1` for the `MAJORITY` rule — the exact
same formula as `requiredVotesToApprove`. For the current 2 founding
orgs, that resolves to `2/2+1 = 2`: **both** orgs' endorsement is
already structurally required for every transaction on this channel,
`institution-cc` included, and has been for the whole project — every
smoke-test `peer chaincode invoke` gathered endorsements from both
`BLCFounder` and `InstitutionA` for exactly this reason, never
previously named as "the co-signing mechanism" but already functioning
as it. Confirmed `chaincode.sh`'s `commit_definition` never passes
`--signature-policy`, so `certificate-cc` inherits this same channel
default unmodified.

**Real caveat surfaced before deciding, not glossed over:** `MAJORITY`
is not "every institution," it's "more than half of the channel's
current orgs" — identical to "all of them" only at N=2, the same
N=2-masks-the-real-distinction trap already known from the 66%-vs-
majority governance question. Once a third institution joins,
`MAJORITY Endorsement` resolves to `3/2+1 = 2` — two of three, not
every institution. Presented this fork explicitly (keep `MAJORITY`,
generalizing to "majority of institutions" forever vs. switch to `ALL`,
either channel-wide or scoped to `certificate-cc` alone via
`peer lifecycle chaincode commit --signature-policy` — confirmed as a
real, distinct per-chaincode override via `peer lifecycle chaincode
commit --help`) rather than picking one silently.

**Decision: keep `MAJORITY` — no configtx or chaincode.sh change.**
`IssueCertificate` needs no `CoSignerID`/`Signatures[]` field and no
endorsement-policy change of any kind; Fabric's existing channel-default
endorsement already is the "co-signing" mechanism, and generalizes
correctly as the consortium grows, matching how the 66% threshold
question was handled (swappable/default-correct, not hardcoded to N=2's
coincidence). `IssueCertificate`'s access-control shape is therefore
exactly the original design-doc reading: **unilateral**, caller = any
active institution, no second institution's chaincode-level action
required to issue. Unblocked — writing it next.

**Implementation: `model.go`, `certificate.go`, `queries.go`,
`issuecertificate.go`, all tests passing.** `Certificate.Metadata`
carries `metadata:"metadata,optional"` from the first draft, not found
the hard way this time. `computeCertificateHash` is shared verbatim by
`IssueCertificate` and `VerifyCertificate` so the two can never drift
apart; relies on `encoding/json`'s documented sorted-map-key marshaling
for the design doc's "metadata keys sorted alphabetically" requirement,
confirmed via `go doc encoding/json Marshal` rather than assumed.
`requireActiveInstitution` calls `institution-cc`'s `GetInstitution` via
`InvokeChaincode`, checking `resp.Status != shim.OK` for "not
registered" — a deliberately narrow `remoteInstitution` type mirrors
only the two fields needed from institution-cc's response, not a shared
Go type across the two independently-deployed chaincodes.

**Test design: two genuinely new mocking mechanisms, walked through and
confirmed before writing any code.** `mocks_test.go` gained `InvokeChaincode`
mocking (a configurable `func(name, args, channel) pb.Response` field per
transaction — institution-cc's own logic is out of scope here, already
covered by its own Phase 7 suite; testing it again through a second fake
ledger would be redundant, not extra rigor) and genuine MVCC read-set
versioning (`fakeLedger.versions` bumped per commit, `fakeStub.readVersions`
snapshotted on each key's *first* read in a transaction, `commit()`
rejecting the whole transaction if any read-set entry's version moved —
matching real Fabric's simulate-then-validate split, not an
approximation of it).

**A real bug found in the concurrency test itself, not the
implementation.** The first attempt at
`TestIssueCertificate_ConcurrentIssuance_OneWinsOneConflicts` asserted
"none of B's pending writes match `ledger.committed` by value" — and
failed, because A and B both independently computed `consortiumNumber =
1` from the same starting state, so A's legitimately-committed
`CERT_COUNTER` value (`"1"`) is byte-identical to what B's rejected
write would have been. Value-equality can't prove *attribution* when two
competing transactions happen to compute the same value. Fixed by
checking key presence instead: `certAKey` exists, `certBKey` doesn't,
and `ledger.committed`'s key set is *exactly* `{certCounterKey,
certAKey}` — nothing extra, nothing missing. This is the same standard
`mustFail`'s `len(stub.pending) > 0` check already holds institution-cc
to (nothing survives a rejected transaction), now applied correctly at
the ledger-attribution level, not a weaker version of it.

**Verified, not just "tests pass":** `gofmt`, `go build -mod=vendor`,
`go vet -mod=vendor` all clean; **13/13** tests pass (stated as 12/12
once, incorrectly — recounted directly from `go test -v` output rather
than trusted from memory); `docker build` against the same `Dockerfile`
pattern as `institution-cc` succeeds.

| Function | Tests | Coverage |
|---|---|---|
| `GetCertificate` | 2 | Exists → correct fields. Does not exist → error, not a partial struct. |
| `VerifyCertificate` | 4 | Valid (no metadata) → `VALID`. Valid (with metadata) → `VALID`. Tampered (stored hash doesn't match recomputed) → `TAMPERED`, certificate still returned alongside the verdict. Does not exist → error. |
| `GetCertificatesByInstitution` | 2 | Multiple certs, one issuer → sorted descending by `consortiumNumber`, other issuers excluded. No certs → empty slice, not an error. |
| `IssueCertificate` | 5 | Success (full field correctness + hash + readback via `GetCertificate`). Sequential second call → counter increments to 2. Caller not a registered institution → rejected. Caller institution not active (defense-in-depth, unreachable today) → rejected. Concurrent issuance → one commits, one gets an MVCC conflict, exact key-set attribution proving the loser's whole transaction vanished. |

**Deployed to the live network and smoke-tested — a real gap caught in
the process, not a clean first pass.** `chaincode.sh deploy
certificate-cc` (no `--init-function`) succeeded, all 5 applicable
stages. The first `IssueCertificate` attempt failed:
`BLCFounderMSP is not a registered institution`. Root cause and
resolution logged in full in `docs/ERROR_LOG.md`'s matching entry — in
short, a prior session claim that the network had been "restored to a
clean state" was inaccurate (it verified `InitLedger` succeeded but
never re-verified `RegisterInstitution` against that specific rebuild).
Re-ran `RegisterInstitution` for both founding orgs, confirmed via
`GetAllInstitutions`, then retried:

```
==== IssueCertificate: BLCFounder ====
status:200 payload: {"certificateId":"cc305ac7...","consortiumNumber":1,
"holderName":"Alice Smith","holderDetails":"Bachelor of Science in
Computer Science","certificateHash":"c3e05694...","issuerId":
"BLCFounderMSP","issuedAt":"2026-07-09T12:42:23Z","status":"active",
"docType":"certificate"}
```
No `metadata` key in the response — correctly omitted, confirming the
`metadata:"metadata,optional"` fix holds up against a real deployed
chaincode, not just the unit tests.

```
==== VerifyCertificate ====
{"status":"VALID","certificate":{...same certificate...}}

==== GetCertificatesByInstitution: BLCFounderMSP ====
[{"certificateId":"cc305ac7...","consortiumNumber":1,...}]
```

All three functions verified against the live network. Phase 8 is done
to the same standard as every prior phase — live-verified, not just
unit-tested.

**Addendum (2026-07-09) — Slack confirmation that certificate-cc's
design needs no changes, relevant to both Phase 8 and Phase 9.** Szymon
(product owner) sent, verbatim:

> Certificate list is public within the network. Institution B accepts
> certificate issued by Institution A by default. At the same time there
> is one incremental register:
> Cert 1 InstitA 1
> Cert 2 InstitA 2
> Cert 3 InstitB 1
> Cert 4 InstitA 3
> Cert 5 InstitB 1

Followed up asking whether the repeated "1" next to Institution B (the
second number in the example, the only part that doesn't fit a clean
per-institution sequence) was a typo. Szymon confirmed: typo, meant "2".

**What this confirms, cross-checked against the current implementation:**
1. "Certificate list is public within the network" — confirms
   `GetCertificatesByInstitution`/`GetCertificate`'s "Anyone" access
   model, already built exactly this way. No change.
2. "Institution B accepts certificate issued by Institution A by
   default" — confirms there is **no per-institution acceptance/
   approval gate on certificates**. Any active institution's certificate
   is automatically valid consortium-wide. Matches `IssueCertificate`'s
   unilateral-issuance design and the earlier-resolved co-signing
   question (Fabric's channel endorsement policy is the only
   "co-signing" mechanism, not application logic). No change.
3. The numbering example, once the typo is corrected, is exactly the
   existing global `CERT_COUNTER` sequence (certs 1 through 5, one
   shared incrementing number across all institutions) — not a second,
   per-institution counter. No new field needed on `Certificate`. No
   change.

**Net effect on Phase 9:** institution admission and certificate
issuance are confirmed as two separate gates. Admission (a new org
becoming an active `Institution`) requires the vote
(`ProposeNewMember`/`CastVote`, majority threshold) — that gate is real.
Certificate issuance requires no further vote — once admitted, an
institution issues unilaterally and immediately. `org-add.sh`'s design
should reflect exactly this: the vote is InstitutionB's *only* gate;
nothing about `certificate-cc` needs its own approval step during
onboarding.

**Correction (2026-07-09, same day) — point 3 above was wrong, not
found until directly asked to re-check it.** Re-reading the example
digit by digit: the *first* number ("Cert N") is the strictly sequential
global position (1,2,3,4,5) — that part was read correctly. The
*second* number is not that same value repeated; it's a **separate,
independent per-institution count** — InstitutionA's certs show `1, 2,
3` (its 1st, 2nd, 3rd) and InstitutionB's show `1, 2` (its 1st, 2nd),
each incrementing only within that institution's own certificates. Had
it been the global counter shown twice, InstitutionB's second
certificate (global position 5) would show `5` in that column, not `2`.
"One incremental register" was misread as "one number"; it's one
register (the list) whose rows carry two independently-incrementing
numbers. Restated back by the user and not caught on that pass either —
worth being direct about, not quietly fixed.

**Decision (2026-07-09): store the per-institution number permanently
at issuance, not compute it on demand.** Option (a) over deriving it
from `GetCertificatesByInstitution`'s existing result (which was
possible — "this is institution X's 3rd certificate" is a trivial
position-in-list computation with no schema change). Reasoning, from
the user: a certificate number is an identity, not a calculated
property; revocation should never retroactively change historical
numbering; auditing requires knowing exactly what number was assigned
*at issuance time*; ledger records should be immutable, not
recomputed from current-state queries whose result set can shrink later
(once `RevokeCertificate` exists) even if a derived "3rd certificate"
label wouldn't shrink in *this* chaincode's specific case today. Adds a
new field, `Certificate.IssuerSequenceNumber`, and a new per-issuer
counter (composite key, analogous to `CERT_COUNTER` but scoped by
`issuerId`) written in the same `IssueCertificate` transaction as the
global counter — lower contention than the global counter (only
same-institution concurrent issuances collide on it), not a new
correctness concern beyond what the existing global-counter concurrency
test already established.

**Known, accepted gap:** the certificate already issued during Phase
8's live smoke test (`cc305ac7...`, `BLCFounderMSP`'s first) predates
this field and has no `issuerSequenceNumber` in its stored data — it
will decode as `0`, not `1`, until the network is next wiped and
redeployed. Not backfilling it; matches this project's existing
"regenerate rather than migrate" MVP posture (`network.sh up` is
explicitly "not idempotent," `blcgen` has no runtime state file). Will
be correct from the next fresh deployment onward.

**Implemented and tested.** Added `Certificate.IssuerSequenceNumber`,
`issuerCounterKey` (a new composite-key namespace, `docTypeIssuerCounter`,
one singleton per issuer — deliberately separate from
`docTypeCertificate`'s own key space), and `nextIssuerSequenceNumber`,
which shares its read-increment-write logic with `nextConsortiumNumber`
via a new common `nextSequenceNumber(ctx, key)` helper rather than
duplicating it. `IssueCertificate` now writes both counters plus the
`Certificate` asset in the same transaction. No `omitempty`/schema risk —
`IssuerSequenceNumber` is unconditionally set on every issued
certificate, same as `ConsortiumNumber`.

Extended the test suite to **15** (from 13): existing tests updated to
assert `IssuerSequenceNumber` alongside `ConsortiumNumber`, plus two new
tests — same-issuer sequential issuance (both counters advance
together: `1,1` then `2,2`) and a **second, independent concurrency
test** for the new counter's own contention surface. `issuerCounterKey`
is scoped per issuer, so two *different* institutions issuing
concurrently never contend on it at all (confirmed: the original
cross-issuer concurrency test's winner commits both its own issuer
counter *and* the global one, while the loser's issuer counter for a
*different* institution is untouched, not merely absent because nothing
happened to it) — that's a materially different scenario from two
transactions from the *same* institution genuinely racing on their
shared issuer counter, which is what the new test exercises. All 15
pass; `gofmt`/`go build -mod=vendor`/`go vet -mod=vendor` clean.

**Not yet redeployed to the live network.** `chaincode.sh` has no
upgrade path (by design, this pass — see Phase 7's "Sequence/version
scope" note); picking this up on the running instance means a full
`network.sh down --wipe && up` plus redeploying both chaincodes and
re-registering both institutions, not a lighter update. Deferring that
until Phase 9 needs a fresh network anyway, rather than doing it now for
its own sake.

---

## Phase 9 — `org-add.sh`

**Design review before writing any code.** Full sequence for InstitutionB
joining walked through and confirmed: (0) governance vote
(`ProposeNewMember`/`CastVote` via `institution-cc`, external to
`org-add.sh` itself — confirmed applicant need not be a channel member
yet, per `ProposeNewMember`'s own doc comment in `governance.go`); (1)
`org-add.sh`'s own fail-closed guard, requiring `GetInstitution` to
already show `status: active` before proceeding; (2) crypto + container
bring-up for InstitutionB, incrementally — **not** via `blcgen generate`
(`ARCHITECTURE.md` explicitly forbids `org-add.sh` touching it), so this
needs its own mechanism reusing the same hand-written compose fragments;
(3) channel config-update in two steps (org-MSP injection signed by both
existing orgs' admins, since `MAJORITY Admins` = both at N=2; anchor-peer
update signed by InstitutionB itself, afterward); (4) peer channel join
using the current config block, not genesis; (5) install **and**
approve both `institution-cc` and `certificate-cc` for InstitutionB; (6)
flip `network.yaml`'s status `pending → member` last, so a failure
anywhere above leaves it untouched and re-runnable.

**Verified, not assumed, before trusting step 5:** whether a
late-joining org needs its own `approveformyorg` for a chaincode
already committed by other orgs, or whether installing the package
alone suffices. This is exactly the kind of claim that turned out wrong
once already this same day (see the "environment restored" entry in
`docs/ERROR_LOG.md`), so it was checked against Fabric's own docs for
the specific "joining after commit" scenario, not the initial-deployment
case already known from Phase 7. `chaincode_lifecycle.md` (release-2.5):

> "A new organization can join a channel with a chaincode already
> defined, and start using the chaincode after installing the chaincode
> package and approving the chaincode definition that has already been
> committed to the channel."
>
> "Organizations that have either not approved a chaincode definition,
> or approved a different chaincode definition will not be able to
> execute the chaincode on their peers."

Confirms install alone does not suffice — InstitutionB's own approval
for both already-committed chaincodes is genuinely required, on
Fabric's own authority, not a safe-by-symmetry guess.

**Also confirmed:** once InstitutionB joins the Application channel
group, `MAJORITY Endorsement`/`MAJORITY Admins` recompute dynamically
against 3 orgs (`3/2+1=2`) for every future transaction, on every
chaincode — an automatic consequence of `ImplicitMetaPolicy` (verified
against Fabric source during Phase 8's co-signing question), not a new
decision requiring its own config change.

**Implementation: skeleton + stage 1 (fail-closed governance guard),
live-verified both ways.** `org-add.sh` follows the same
stage()/trap-on-error/`FAILED at stage N` conventions as
`network.sh`/`chaincode.sh`, sourcing the shared `lib/common.sh`,
`lib/crypto.sh`, `lib/orgs.sh`. `require_active_institution` queries
`institution-cc`'s `GetInstitution` via an *existing* active org's peer
(the org being added has none of its own yet) and refuses every later
stage unless the response shows `status: active`.

**A real bug found immediately, not a clean first pass.** The first
version's `response=$(peer chaincode query ... 2>&1)` tripped `set -e`
on the query's own expected nonzero exit (querying a not-yet-approved
institution is *supposed* to fail) — aborting before the Python
interpretation step that was meant to turn that into a specific,
friendly message ever ran, and firing the generic `ERR` trap twice in
the process. Fixed with a trailing `|| true` on that assignment,
documented inline: the query's own exit code is expected to vary and is
deliberately not what decides pass/fail here — the Python step
downstream is.

**A real, separate operational finding while testing the positive
case, not part of `org-add.sh` itself.** Ran the actual governance flow
live — `ProposeNewMember` (InstitutionBMSP, proposed by BLCFounder),
then `CastVote` "yes" from both BLCFounder and InstitutionA, fired back
to back with no gap. Both invokes reported `"Chaincode invoke
successful"`, but a direct `GetProposal` query against committed state
afterward showed `votesFor: 1`, `status: "open"` — one vote's commit
had silently failed MVCC validation, exactly the same contention shape
already tested for `CERT_COUNTER` in Phase 8, just not previously
exercised for `CastVote`'s own shared proposal key under genuinely
concurrent (not sequential) votes. The peer CLI's "invoke successful"
only confirms endorsement/submission, never final commit validation —
re-cast the losing vote (confirmed via `GetProposal`, not assumed) and
the proposal correctly reached `status: "approved"`, `votesFor: 2`.
**Operational conclusion, not a chaincode bug:** votes on the same
proposal must be cast sequentially (each confirmed committed before the
next), or a caller must verify the actual committed result rather than
trust the invoke response — worth remembering for however the live
demo actually drives the vote.

**Not filed away as just an operational note — checked whether it
exposed a real test gap, and it did.** Before moving on to Phase 2,
confirmed precisely which of two very different explanations this was:
Fabric's normal "loser must retry" MVCC behavior (already proven
correct for `CERT_COUNTER`), or a genuine silent-data-loss bug in
`CastVote` that had shipped through Phase 7 undetected. It's the
former — but `institution-cc`'s own fake stub had no way to even
*model* the distinction (no version tracking in `commit()` at all), and
none of its 6 existing `CastVote` tests exercised true concurrent
voting, only sequential. Ported `certificate-cc`'s proven
MVCC-versioning model into `institution-cc`'s `mocks_test.go` and added
`TestCastVote_ConcurrentVotes_OneWinsOneConflicts`, mirroring the live
scenario exactly (including the exact-key-presence check on the losing
vote, not just "the count is right"). Confirmed the new test can
actually fail — temporarily reverted `commit()` to blind-overwrite,
watched the test fail with a clear message, then restored the fix.
26/26 tests pass (25 existing + 1 new). Full detail in both of
`docs/ERROR_LOG.md`'s matching 2026-07-13 entries.

**Verified, both directions:** `org-add.sh InstitutionB` against an
unapproved InstitutionB fails closed with a specific message, no trap
double-fire, `network.yaml` untouched. Against a genuinely
committed-approved InstitutionB (confirmed via `GetProposal`, not the
invoke response), stage 1 passes cleanly, exit 0.

**Stage 2 implemented: crypto enrollment + container bring-up,
live-verified.** Extracted `wait_for_port` from `network.sh` into
`lib/common.sh` (same pure-code-motion pattern as the earlier
`crypto.sh`/`orgs.sh` extractions) — `org-add.sh` needs the identical
readiness check for a new org's own peers. `start_org_ca`/
`start_org_couchdb`/`start_org_peer` assemble raw `docker run` commands
matching `docker-compose-ca.yaml.tmpl`/`docker-compose-net.yaml.tmpl`'s
per-service shape field-for-field, including `CORE_PEER_GOSSIP_
BOOTSTRAP`'s exact algorithm — read directly from `blcgen`'s own
`compose_data.go` (`BuildComposeData`) rather than reverse-engineered:
each peer's bootstrap is every *other* peer in its own org,
comma-joined. That function's own comment already anticipated this:
*"a 'pending' org's containers are started later by org-add.sh's own
compose fragment, never by this one."* `bring_up_org_containers` ties
it together: start the CA, `wait_for_ca`, call `lib/crypto.sh`'s
`bootstrap_org` (the exact function `bootstrap-crypto.sh` uses for
every founding/member org, here for just the one new org), then
CouchDB(s) and peer(s) in dependency order.

**A real bug found immediately, live.** First run failed:
`mkdir: cannot create directory '.../crypto/ca-servers/InstitutionB':
Permission denied`. Root cause: `crypto/ca-servers/` is already
root-owned (the CA process inside each container runs as root, and
Docker auto-creates a missing bind-mount source directory as whatever
UID the container writes as — same mechanism already documented in
`docs/ERROR_LOG.md`'s 2026-07-06 root-owned-crypto entry) — a plain
user-owned `mkdir -p` underneath an existing root-owned parent fails.
Fix: removed the manual `mkdir` entirely; Docker already creates the
directory correctly on first mount, exactly how `BLCFounder`'s/
`InstitutionA`'s identical directories came to exist without any
script ever creating them directly. Re-ran clean: `InstitutionB`'s CA,
Admin, and both peers' crypto enrolled correctly, all 5 containers
(`ca.InstitutionB`, 2×`couchdb.*.InstitutionB`, 2×`peer*.InstitutionB`)
started and stayed up — confirmed not just "up" but genuinely healthy
by reading `peer0.InstitutionB`'s own logs directly: it shows a
successful `GossipStream` probe from `peer1.InstitutionB`, proving the
`GossipBootstrap` computation is correct, not just plausible-looking.

**Stages 3-4 implemented: two-step channel config-update, manually
verified end-to-end before writing any script code, then confirmed via
the actual script.** Before writing `inject_org_into_channel`/
`set_anchor_peers`, ran the full sequence by hand against this live
network first — `peer channel fetch config` → `configtxlator
proto_decode` → merge via `jq` → `proto_encode` ×2 →
`configtxlator compute_update` → decode → wrap in a config-update
envelope → `peer channel signconfigtx` (per signer) → `peer channel
update` — for both the org-injection update (signed by existing orgs)
and the anchor-peer update (signed by InstitutionB's own admin,
confirmed to work even though InstitutionB had not yet joined the
channel as a peer — signing only needs a valid MSP identity, not
channel membership). Two real findings from that manual pass, both
folded into the actual functions:
1. Application groups in the channel config are keyed by **org name**
   ("InstitutionB"), not MSP ID ("InstitutionBMSP") — confirmed by
   inspecting the live fetched config directly, not assumed from the
   MSP-ID-keyed naming used everywhere else in this project.
2. `configtxgen -printOrg`'s own INFO logs go to stdout by default —
   same class of bug as `chaincode.sh`'s log-corrupting-captured-
   output issue from Phase 7. My first manual attempt merged `2>&1`
   myself and corrupted the captured JSON; the actual function only
   captures stdout, with stderr going to `/dev/null` explicitly.

`build_new_org_definition` generates a throwaway `configtx.yaml` (just
one `Organizations` entry, pointing at the new org's already-enrolled
`MSPDir` from stage 2) and calls `configtxgen -printOrg` against it —
this produces the exact policy/MSP JSON shape Fabric expects, instead
of hand-constructing `FabricMSPConfig` protobuf JSON by hand. Policy
rules match the existing orgs' exact shape, read directly from the
generated `configtx.yaml`, not reconstructed from memory: Readers
`OR(admin,peer,client)`, Writers `OR(admin,client)`, Admins
`OR(admin)`, Endorsement `OR(peer)`.

**A real, recurring teardown gap found immediately while resetting for
a clean test.** Wiping the network to test stages 3-4 via the actual
script (not replay manually-committed state) hit the identical
"`Network blc Resource is still in use`" symptom as the earlier
chaincode-teardown incident — `org-add.sh`'s own CA/peer/CouchDB
containers (stage 2) are started via plain `docker run`, invisible to
`docker compose down`, same as the chaincode containers were. Worse in
one respect: since `org-add.sh` can never touch `blcgen generate`, an
onboarded org's containers can *never* migrate to compose management,
even after stage 7 eventually flips its status to `member` — unlike
the chaincode case, there's no future point where this resolves itself.
Fixed with an `org-add.sh teardown` verb (enumerates every non-founding
org in `network.yaml`, removes its containers) wired into `network.sh`'s
`cmd_wipe` alongside the existing `chaincode.sh teardown` call. Full
detail in `docs/ERROR_LOG.md`.

**Verified via the actual script, from a genuinely clean state — not
manual commands.** Fresh `network.sh down --wipe && up`, deployed
`institution-cc`, registered both founders, proposed and voted
InstitutionB (sequentially this time — see the earlier vote-race entry
— reached `approved` on the first attempt, no retry needed), then ran
`./org-add.sh InstitutionB` end-to-end: all 4 stages completed, exit 0.
Independently confirmed by fetching the channel config fresh afterward
(not trusting the script's own success message): `InstitutionB` present
in `Application.groups`, `AnchorPeers` correctly set to both of its
peers.

Stages 5-7 (peer channel join, chaincode install+approve for both
chaincodes, status flip) not yet implemented.

**Stage 5 implemented — a real, wrong design assumption caught live,
not just a bug in the code.** The original design (see this file's own
stage-list comment before this fix) assumed a late-joining peer needed
the channel's CURRENT config block, not the stale genesis block —
reasoned but never tested. First live run refuted it outright: Fabric's
own ledger-creation code rejects any block number other than 0 for a
peer's first join (`cannot create ledger from genesis block: expected
block number=0, received block number=N`). Corrected to join via
`GENESIS_BLOCK` — the same constant `network.sh`'s own `join_peers`
already uses for founding orgs — and removed the now-unneeded
`fetch_newest_block` entirely. A peer joining via genesis catches up to
the current state afterward through normal orderer block delivery,
which already includes whatever config updates happened after genesis;
it doesn't need those changes present in the block it joins with. Full
diagnosis in `docs/ERROR_LOG.md`.

**A second real failure, distinct from the first:** once the
genesis-block fix was in, one retry hit a hard TLS handshake failure
(`connection reset by peer`) joining `peer0.InstitutionB` — the same
class of TCP-vs-TLS-readiness race already documented as benign
elsewhere in this project, except this time it didn't self-heal (unlike
`peer chaincode invoke`, `peer channel join` has no retry/backoff of
its own). Fixed with a scoped 5-attempt retry loop around the join call
in `join_new_org_to_channel`, not a change to the shared `wait_for_port`.

**A real, costly mistake — my own — during recovery from the first
failure.** Between test attempts, a "targeted cleanup" (`rm -rf
crypto/ca-servers/InstitutionB` among other paths, intended only to
clear an already-registered CA identity blocking a stage-2 retry)
destroyed the CA's own root keypair, not just its registered-identity
database. `InstitutionB`'s MSP definition — including that CA's root
cert — had already been committed to the channel in stage 3, during
the FIRST crypto generation. The recreated CA generated a different
root key; every identity re-enrolled afterward was signed by an
authority the channel's already-committed config had never heard of and
had no way to learn about after the fact — including `InstitutionB`'s
own admin identity, leaving no identity the channel would accept to
correct it. Unrecoverable for that `InstitutionB` instance; required a
full `network.sh down --wipe` and complete redo (institution-cc
redeploy, founder registration, propose/vote, `org-add.sh` again, with
no crypto deletion this time). Rule carried forward from this, not just
a story about it: never manually delete inside `crypto/ca-servers/<org>`
once that org's MSP is channel-committed — the only safe recovery past
that point is a full wipe, never a partial one. Full detail in
`docs/ERROR_LOG.md`.

**Stage 5 verified live, twice, from two different clean rebuilds** —
first through to a full 7-stage run, then again after the CA-root
mistake forced a second rebuild. Both `peer0.InstitutionB` and
`peer1.InstitutionB` independently confirmed via `peer channel getinfo`
at matching heights and block hashes with the founding peers — not just
trusting the script's own "Successfully submitted proposal to join
channel" line.

**Stage 6 implemented — extracted shared chaincode logic before writing
new code, verified the extraction didn't break anything, then found a
genuine cross-script design gap.** `package_and_install_for_org`,
`approve_for_org`, `wait_for_ccaas_ready`, and `start_ccaas_container`
were moved out of `chaincode.sh` into a new `scripts/lib/chaincode.sh`
(pure code motion, same pattern as the earlier `crypto.sh`/`orgs.sh`
extractions) — `org-add.sh` needed the same per-org packaging/install/
approve/ccaas-start logic `chaincode.sh` already had, just never
callable outside it. Verified with a real regression test: redeployed
`institution-cc` through the refactored code, confirming the
already-committed/recover-package-IDs/restart-ccaas path still worked
correctly (it failed at the final `InitLedger` re-invoke, but for
Fabric's own expected reason — "already initialized but called as
init" — not a regression).

**Real finding: deploying a chaincode after a pending org has already
joined the channel blocks that chaincode's own commit.** Redeploying
`certificate-cc` fresh (after `InstitutionB` had already completed
stages 3-5 in this same rebuild) failed at `checkcommitreadiness`:
`not enough approvals yet, missing: InstitutionBMSP` — despite
`InstitutionB` never being asked to approve anything and its
`network.yaml` status still reading `pending`. Root cause:
`checkcommitreadiness`'s approvals map reflects every org currently in
the channel's Application group, not just the `founding`/`member` orgs
`chaincode.sh` iterates — Fabric's own view of channel membership and
this project's `network.yaml` bookkeeping had diverged, and Fabric's
view is what actually gates commits. This reframed stage 6's design:
it cannot assume a chaincode is always already committed by the time a
new org approves it; approval must happen unconditionally, since
sometimes it's what an otherwise-stuck commit was waiting on. Unblocked
by having `InstitutionB` install+approve `certificate-cc` manually
first, then re-running the founding orgs' commit, which succeeded with
all 3 orgs approved. What's confirmed vs. reasoned, precisely: this
session observed the requirement with `InstitutionB`'s peers already
joined; whether it appears immediately after stage 3 alone (before any
peer or ccaas container exists) is architecturally plausible but not
directly tested — see `docs/ERROR_LOG.md` for the full scope note.

**Two more non-idempotency gaps found and fixed while re-testing stage
6** — both are the second and third times this project has hit "safe to
re-run" not actually being true. Stage 2 (`bring_up_org_containers`)
failed on a legitimate resume with `Identity 'orgadmin' is already
registered`; fixed with `org_crypto_exists`, checking whether the org's
assembled MSP directory already exists before re-enrolling. Stage 5
then failed the same way (`ledger [blcchannel] already exists with
state [ACTIVE]`) on the very next resume; fixed with a per-peer
`peer channel getinfo` check inside `join_new_org_to_channel`, skipping
any peer that's already joined. Both mirror stage 3-4's existing
`is_channel_member` guard: query real state, don't cache a flag.

**Stage 7 implemented — the only stage that mutates `network.yaml`,
deliberately last.** `flip_status_to_member` rewrites only the target
org's `status: pending` line to `status: member`, via a targeted regex
on the raw file text rather than a full `yaml.load`/`yaml.dump`
round-trip — this file has no comments today, but a full round-trip
through PyYAML's own dumper could still silently reorder keys or change
formatting elsewhere; a scoped substitution changes nothing else by
construction. Verified directly: `network.yaml` diffed byte-for-byte
identical except the one status line, and a subsequent
`./org-add.sh InstitutionB` correctly refused with `status ... is
'member', not 'pending' — nothing to add`.

**Full 7-stage pipeline verified live, end-to-end, from a genuinely
clean network — confirmed, not assumed.** Fresh `network.sh down
--wipe && up`, deployed `institution-cc` then `certificate-cc`,
registered both founders, proposed and voted `InstitutionB` (approved
2-for-2), then ran `./org-add.sh InstitutionB` through all 7 stages to
completion in one clean pass with no manual intervention. Beyond the
script's own success message: independently queried `institution-cc`'s
`GetInstitution` for `InstitutionB` *through `InstitutionB`'s own
peer/ccaas container* and got back the correct, real record
(`status:"active"`) — proof its chaincode stack actually executes
queries, not just that lifecycle commands returned success.

**Phase 9 complete.** `org-add.sh` now takes a `pending` organization
from zero to a fully participating consortium member — crypto, channel
membership, chaincode access, and status — in one command, safely
resumable at every stage. This closes the full 9-phase build: BLC-31 is
a live, 3-institution, dual-chaincode Hyperledger Fabric consortium
network with a governance-gated onboarding flow, generated by `blcgen`,
bootstrapped by `network.sh`, and extended at runtime by `org-add.sh` —
built and verified one command at a time. Full incident-level detail
for every finding referenced above is in `docs/ERROR_LOG.md`.

**Post-closeout: a test-coverage audit found real, previously-unnoticed
gaps — closed with genuine live verification, not assumption.**
Reviewing exactly what had been tested (prompted by a direct question,
not a failure) surfaced that `institution-cc`'s `GetAllInstitutions` and
all 4 of `certificate-cc`'s functions (`IssueCertificate`,
`VerifyCertificate`, `GetCertificate`, `GetCertificatesByInstitution`)
had never actually been invoked against a real network — deployment and
onboarding mechanics were thoroughly proven, but several individual
chaincode functions never were. Closing this required a full rebuild
first (the network had been fully wiped since Phase 9 closed), which
surfaced one more genuine bug along the way:

**A new bug, distinct from anything found during Phase 9 itself — and
a fix that itself needed two rounds of correction before it actually
worked, caught only by insisting on re-triggering the real race rather
than trusting a plausible diagnosis.** `org-add.sh InstitutionB`'s
stage 6 failed installing `institution-cc` for the new org: `access
denied: channel [blcchannel] creator org unknown, creator is malformed`
— occurring ~230ms after stage 5's peer join had already succeeded.
Root cause: a successful `peer channel join` only means the join
proposal was accepted; the peer still needs to asynchronously process
every historical block afterward before its own local MSP manager
recognizes its own org. Stage 6 used the new org's peer0 as
`approveformyorg`'s signer immediately after stage 5 returned, with no
wait for that catch-up.

The first fix (`wait_for_peer_msp_sync`, polling the new org's peer0
until its height matches an existing peer's) was written and initially
reported as confirmed based on a natural ~20-minute retry succeeding —
but that retry happened *before the fix existed*, so it proved the
diagnosis, not the fix. Directly challenged on this distinction
(claiming "the retry succeeded" and "the fix works" are the same thing
would have been a real error), a proper re-test was run: full rebuild,
`org-add.sh InstitutionB` immediately after the vote, deliberately no
pause. This surfaced two further bugs in the fix itself: a `set -e`/
`pipefail` interaction that crashed the script outright the first time
`InstitutionB`'s peer genuinely hadn't caught up yet (fixed with `||
true` on the height-fetching assignments), and — found only after
fixing the first — a JSON-parsing bug that made the function unable to
ever succeed for anyone, since `peer channel getinfo`'s real output
(`Blockchain info: {...}`) isn't pure JSON and was never parseable by
the original code (confirmed because even the already-synced
*reference* peer's height came back "unknown," not just the new org's).
After both fixes, a further retry showed a correctly-parsed real height
and the full pipeline completing through stage 7. Full blow-by-blow,
including the precise scope of what's proven versus reasonably
inferred, is in `docs/ERROR_LOG.md`.

**The actual audit verification, live, unedited output confirmed for
each:**
- `GetAllInstitutions` → returned all 3 institutions
  (`BLCFounderMSP`, `InstitutionAMSP`, `InstitutionBMSP`), each
  `status:"active"`, `InstitutionBMSP` correctly showing
  `type:"approved"` and `approvedBy` both founders (vs. the founders'
  own `type:"founding"`).
- `IssueCertificate` (called by `BLCFounderMSP`, holder "Jane Doe") →
  committed `VALID` on both `BLCFounder` and `InstitutionA` peers,
  returned `consortiumNumber:1`, `issuerSequenceNumber:1`, a computed
  `certificateHash`, `status:"active"`.
- `VerifyCertificate` (same certificate) → `{"status":"VALID",
  "certificate":{...}}`, hash recomputation matching the stored value.
- `GetCertificate` (same certificate) → returned the identical record
  by direct ID lookup.
- `GetCertificatesByInstitution("BLCFounderMSP")` → returned an array
  containing that same certificate, correctly attributed.

All 5 previously-untested functions confirmed working correctly against
a real network, not assumed from their unit tests or from the chaincode
simply being deployed. Both this audit's finding and the new stage-6
bug are logged as their own dated `docs/ERROR_LOG.md` entries, matching
this project's standing discipline: a gap in test coverage is treated
as seriously as a live failure, and closed the same way — with direct
evidence, not assertion.

---

## Phase 10 — `RevokeCertificate` for `certificate-cc`

**Goal:** implement certificate revocation, resolving the scope question
left open since Phase 8 — confirmed in scope by Szymon on 2026-07-15
("we still need to move forward with that").

**Design decisions, confirmed with the user before writing any code**
(not assumed, per this project's standing discipline):
1. Only the certificate's original issuer (caller MSP ==
   `certificate.IssuerID`) may revoke it — no governance vote, no other
   institution allowed. Mirrors `IssueCertificate`'s existing unilateral
   design; the multi-org endorsement policy is the trust mechanism, not
   chaincode-level approval.
2. `VerifyCertificate` gains a third result, `REVOKED`, alongside
   `VALID`/`TAMPERED`. Priority: hash mismatch → `TAMPERED` (even if
   also revoked) → else revoked → `REVOKED` → else `VALID`.
3. `RevokeCertificate` requires a non-empty `reason` (stored permanently
   as `RevokedReason`, alongside a `RevokedAt` timestamp) and errors on
   an already-revoked certificate — no idempotent double-revoke, since
   the goal is preserving the original reason/timestamp, not silently
   accepting repeat calls.
4. Both deploy scripts share one `CC_VERSION`/`CC_SEQUENCE` pair; ship
   this by bumping the shared pair and redeploying BOTH chaincodes, even
   though `institution-cc`'s own source is unchanged — matches how the
   scripts already assume one shared version/sequence today.

**Implementation:**
- `chaincode/certificate-cc/model.go` — added `RevokedAt`/
  `RevokedReason` fields (with the `metadata:"...,optional"` tag, same
  requirement as `institution-cc`'s `ApprovedBy`/`ResolvedAt` precedent
  — contractapi treats every struct field as required unless tagged
  otherwise) and a new `verificationStatusRevoked = "REVOKED"` constant;
  replaced the now-stale "not yet scoped" comment on
  `certificateStatusRevoked`.
- New file `chaincode/certificate-cc/revokecertificate.go` — the
  `RevokeCertificate` function itself, mirroring `IssueCertificate`'s
  shape (get caller MSP → load via `getCertificate` → validate → mutate
  → `putCertificate`). Deliberately does NOT call
  `requireActiveInstitution` — an institution that issued a certificate
  while active, then later left/was suspended, must still be able to
  revoke its own prior issuances.
- `chaincode/certificate-cc/queries.go` — `VerifyCertificate` updated
  with the TAMPERED → REVOKED → VALID priority order.
- New `chaincode/certificate-cc/revokecertificate_test.go` (5 tests) and
  2 new cases in `verifycertificate_test.go`, reusing the existing
  `mocks_test.go` fakes with no new test infrastructure needed.

**Bug found and fixed — hardcoded `CC_SEQUENCE="2"` failed on a freshly
wiped channel.** Full detail in `docs/ERROR_LOG.md`'s 2026-07-20 entry:
Fabric's strict per-channel sequence-increment rule meant the "bump to
1.1/2" design (correct for upgrading the already-deployed Monday
network) failed once the network was wiped and rebuilt from scratch for
unrelated environment-health reasons (~2 days of container decay from
the machine sleeping). Fixed by setting `CC_SEQUENCE="1"` to match this
fresh channel's actual (zero) prior commit history, keeping
`CC_VERSION="1.1"` as a version label.

**Verification:**
- `go test ./...` from `chaincode/certificate-cc` — all 22 tests pass
  (15 pre-existing unchanged, 7 new: 5 `RevokeCertificate` + 2
  `VerifyCertificate`).
- Live end-to-end, real unedited terminal output confirmed for each
  step: issued a certificate (`consortiumNumber:1`,
  `issuerSequenceNumber:1`) → `VerifyCertificate` returned `VALID` → a
  non-issuer's revoke attempt was rejected (`"InstitutionAMSP is not the
  issuer of certificate ..."`) → the actual issuer (`BLCFounderMSP`)
  revoked it with a reason → `VerifyCertificate` returned `REVOKED` with
  `revokedReason`/`revokedAt` populated → a second revoke attempt on the
  same certificate was rejected (`"certificate ... is already
  revoked"`) → `GetCertificate` re-queried and confirmed the ORIGINAL
  reason/timestamp was untouched, not overwritten by the rejected second
  attempt.

**Result:** Phase 10 exit condition met — `RevokeCertificate` is
implemented, unit-tested, and proven working end-to-end against a real
running 3-org network, with the confirmed authorization/priority/
idempotency rules all directly observed, not assumed.

---

## Phase 11 — NestJS Fabric Gateway backend

**Goal:** implement the "NestJS Fabric Gateway service" named in
`ARCHITECTURE.md` but never built — a REST API fronting the certificate
lifecycle (issue/get/verify/revoke/list-by-institution) plus two
read-only institution lookups, following Szymon's 2026-07-15
confirmation that backend integration is the next phase of work.

**Design decisions, confirmed with the user before writing any code**
(not assumed, per this project's standing discipline):
1. Fabric SDK: `@hyperledger/fabric-gateway` (modern, Fabric 2.4+
   official SDK) over the legacy `fabric-network` SDK — connects via
   direct gRPC to one peer per org using that org's TLS root cert +
   signing identity directly, not the connection-profile JSON files
   `blcgen generate profiles` produces.
2. Identity/deployment model: one shared NestJS codebase, deployed as N
   separate running instances (one per org), each configured via
   environment variables — mirrors this repo's existing "one
   image/template, N per-org instances via env vars" pattern
   (`docker-compose-net.yaml.tmpl`, ccaas containers).
3. Runs on the host (`localhost:<peer_port>`), matching every peer CLI
   command used throughout this project — no containerization this
   phase.
4. Endpoint scope: 7 of 11 non-`InitLedger` functions — full certificate
   lifecycle plus `GetInstitution`/`GetAllInstitutions` (needed to make
   issuance usable end-to-end). Governance/voting functions
   (`RegisterInstitution`/`ProposeNewMember`/`CastVote`/`GetProposal`)
   deferred — still tied to the manual `org-add.sh` ceremony, not a pure
   API action.
5. No HTTP-level authentication this phase — confirmed explicitly
   scoped (demos run screen-shared on the user's own machine only,
   cloud deployment a real but non-immediate future consideration),
   documented in `ARCHITECTURE.md`'s "Key decisions" #10 as a hard
   prerequisite gate before any cloud/remote deployment, not an
   optional hardening step.

**Grounded facts confirmed by direct inspection before designing** (not
assumed): each org's Admin MSP private key has no fixed filename (a
random `*_sk` hash in `users/Admin/msp/keystore/`, unlike the fixed
`tls/key.pem`) — the backend globs this directory at startup; peer TLS
certs were enrolled with `--csr.hosts localhost`, so no
`ssl_target_name_override` is needed connecting from the host; no
peer-side mutual TLS is configured, so
`grpc.credentials.createSsl(rootCert)` alone suffices; the channel's
`MAJORITY Endorsement` policy means a single gRPC connection to one
org's peer is sufficient even for `IssueCertificate`, since Fabric's own
Gateway/discovery service transparently routes endorsement.

**Implementation:** scaffolded `backend/` from scratch (previously
completely empty) — `FabricGatewayModule`/`FabricGatewayService` (one
long-lived gRPC connection per instance, established at `onModuleInit`,
torn down at `onModuleDestroy`), `fabric-identity.util.ts`'s
keystore-globbing, a global `FabricExceptionFilter` translating Fabric
Gateway SDK exceptions into HTTP status codes, and
`InstitutionsModule`/`CertificatesModule` with DTOs matching the Go
structs exactly (including the `metadata`-must-be-`JSON.stringify`'d
wire-format gotcha already known from the peer CLI work).

**Bug found and fixed — `SubmitError` type-only export broke the
build.** Full detail in `docs/ERROR_LOG.md`'s 2026-07-20 entry:
`@hyperledger/fabric-gateway`'s public entry point re-exports
`SubmitError` as type-only even though it's a real class; fixed by
relying on `SubmitError extends GatewayError` (catching `GatewayError`
already covers it via `instanceof`) rather than naming it directly in
`@Catch()`.

**Bug found and fixed — revoke endpoint returned `201` instead of
`200`.** NestJS's default status code for any `@Post()` handler is
`201 Created`, correct for `IssueCertificate` (creates a resource) but
wrong for `RevokeCertificate` (mutates an existing one, creates
nothing). Fixed with an explicit `@HttpCode(HttpStatus.OK)`, confirmed
live via a fresh issue+revoke cycle.

**Verification:** live end-to-end against the real running 3-org
network, real unedited terminal output confirmed for every step:
- Clean startup as `BLCFounderMSP` (`localhost:7051`), all 7 routes
  mapped, no TLS/path errors.
- `GET /institutions` correctly returned only the 2 registered
  institutions (not 3) — accurately reflecting that `InstitutionB`,
  though a real channel member, was never re-registered in this
  session's freshly-rebuilt ledger; not a bug.
- `GET /institutions/BLCFounderMSP`, `POST /certificates` (issue),
  `GET /certificates/:id`, `GET /certificates/:id/verification`
  (`VALID`), `GET /institutions/:id/certificates` (correctly showing
  both a peer-CLI-issued and an API-issued certificate together,
  including a previously-revoked one with its `revokedAt`/
  `revokedReason`) — all cross-checked and correct.
- A second instance as `InstitutionAMSP` (`localhost:9051`) attempting
  to revoke `BLCFounder`'s certificate was rejected with a mapped `403`
  (`EndorseError`, "is not the issuer") — confirmed via the actual
  logged exception shape, not assumed.
- The genuine issuer's revoke succeeded (`200` after the status-code
  fix); a second revoke attempt on the same certificate was rejected
  with a mapped `409` ("already revoked").
- Graceful shutdown confirmed (`Ctrl+C` → clean, fast exit, no hanging
  gRPC connection).

**Result:** Phase 11 exit condition met — the backend is implemented,
builds cleanly, and is proven working end-to-end against the real live
network, including the cross-org authorization boundary and
error-mapping behavior, not assumed from unit tests alone (none were
written this phase — flagged as a real gap, see Follow-up).

**Follow-up:** no automated tests exist for the backend yet (unlike
every chaincode function, which has a full unit test suite) — this
phase's verification was entirely live/manual. Worth adding Jest-based
unit tests (mocking `FabricGatewayService`) and/or e2e tests before
this grows further. Also: `RegisterInstitution`/`ProposeNewMember`/
`CastVote`/`GetProposal` remain unexposed — revisit once/if
`org-add.sh`'s stages get their own API-triggerable hooks (see this
phase's endpoint-scope decision above).

## Phase 12 — Certificate UI (Next.js frontend)

**Goal:** build the first real product-quality UI for the consortium,
following the 2026-07-24 team demo's feedback (Dominik: a terminal/
Swagger-only demo reads poorly to anyone outside the team) and the
2026-07-27 Szymon/Neethu sync's decision to shift full sprint focus to
frontend now that the v1.0 backend is complete. `frontend/` had existed
as an empty directory since project scaffolding but was never built.

**Design decisions, confirmed with the user before writing any code:**
1. Scope: login (cosmetic) → dashboard → issue/verify/view/revoke
   certificates + read-only institutions list. Explicitly NOT
   institution onboarding, NOT governance/voting UI, NOT real backend
   auth this pass.
2. Architecture: one shared, multi-tenant Next.js app (not one
   deployment per institution) — matches the 2026-07-27 sync's Option 2
   decision (see `docs/UI_PLAN_DRAFT.md`), reversing this doc's own
   earlier draft recommendation of mirroring the backend 1:1.
3. Stack: Next.js (TypeScript, App Router) + Tailwind + shadcn/ui
   (chosen over hand-rolled Tailwind-only, for proven, accessible,
   polished component patterns delivered fast).
4. Layout: top navbar + separate pages per action (chosen over sidebar
   or single-page/modal layout).
5. Backend changes are allowed when they genuinely improve the product
   (not a hard "UI-only" constraint) — concrete assessment for this
   pass: none were needed. The existing 7 endpoints/DTOs, re-verified
   against actual source before building, covered every in-scope
   action cleanly.
6. **Login is explicitly cosmetic, not real authentication** — a real-
   looking username/password screen backed by a small hardcoded,
   non-secret credential list (no user database, no password hashing,
   no session/token infra), whose only job is picking which
   institution's backend base URL a session talks to. Documented in
   three places per the user's explicit instruction this must never be
   mistaken for real auth later: a code comment in
   `lib/institutions.ts`, `ARCHITECTURE.md`'s new decision #11, and
   here.

**Architecture:** all backend calls happen server-side, inside Next.js
Server Components (reads) and Server Actions (writes) — the browser
only ever talks to the Next.js app itself. Session is an httpOnly
cookie storing only `institutionId`; every server-side call re-derives
`baseUrl`/`displayName` from a static config (`lib/institutions.ts`),
never trusting a client-supplied value. This kept the "no backend
changes needed" conclusion true without any CORS work, since
server-to-server calls aren't subject to browser CORS.

**Grounded facts confirmed by direct inspection before building** (not
assumed): re-verified all 7 endpoint routes/DTOs/env values directly
against `backend/src/**` and `backend/.env.*` rather than trusting
memory from Phase 11 — all matched exactly (ports 3001/3002/3003 for
BLCFounder/InstitutionA/InstitutionB). Also discovered, via the bundled
Next.js docs (`node_modules/next/dist/docs/`), that this project's
pinned Next.js version (16.2.12) has real breaking changes from
commonly-assumed conventions — see bugs below.

**Bug found and fixed — Next.js 16 renamed `middleware.ts` to
`proxy.ts`.** Same functionality, new file/export name
(`export function proxy(...)`, not `middleware`) — confirmed against
the bundled docs before writing the auth-gate file, not assumed from
prior Next.js knowledge. Written directly as `proxy.ts` from the start
once discovered; documented inline why the file isn't named
`middleware.ts`.

**Bug found and fixed — shadcn/ui's Base UI-based `Button` doesn't
support `asChild`.** This project's shadcn/ui registry version composes
via a `render` prop (`<Button render={<Link href="..." />}>`), not
Radix's `asChild`/child-element pattern — caught by `tsc --noEmit`
across three files (`empty-state.tsx`, dashboard `page.tsx`,
certificate detail `page.tsx`) before ever reaching the browser.

**Bug found and fixed — Base UI console error composing `Button` with a
non-`<button>` `render` target.** Every `Button` composed as a `<Link>`
logged `"A component that acts as a button expected a native <button>
... Use nativeButton to false"` at runtime (visible as the Next.js dev
overlay's "1 Issue" badge, not just a console line) — fixed by adding
`nativeButton={false}` to all three affected `Button` usages. Caught
during live browser verification, not just a build check, since
`tsc`/`eslint` had no way to catch a runtime-only console warning.

**Bug found and fixed — `setState` synchronously inside a `useEffect`
in the revoke dialog.** The initial `RevokeSection` implementation used
`useActionState` + a `useEffect` watching `state.success` to close the
dialog and toast — `eslint`'s `react-hooks/set-state-in-effect` rule
(new/stricter in this React 19 toolchain) flagged this as a real error,
not a style nit: the recommended fix was to stop syncing external
Server Action state via an effect at all. Rewrote `RevokeSection` to
call the Server Action directly from a `useTransition`-wrapped click
handler (manually constructing `FormData`) instead of wiring it through
`<form action=...>` + `useActionState` — avoids the effect entirely, at
the cost of that one dialog no longer degrading gracefully without JS
(acceptable, since opening a confirmation dialog already requires JS).

**Verification:** live end-to-end against the real running 3-org
network (network + both backend instances rebuilt fresh this session
after being found completely down), driven by a headless Chromium via
Playwright rather than just `tsc`/`build` passing:
- Login as BLCFounder → dashboard correctly lists only that
  institution's real certificates.
- Issued a real certificate through the form → correct
  `consortiumNumber`/`issuerSequenceNumber` continuing the real ledger
  sequence (not reset to 1), success toast, redirect to detail page.
- "Run full verification" → correctly showed `VALID`.
- Logged out, logged in as InstitutionA, navigated directly (by URL) to
  BLCFounder's certificate → **Revoke button correctly absent from the
  DOM entirely**, not just disabled — confirmed both immediately and
  after a hard page reload.
- Logged back in as BLCFounder, revoked the certificate with a reason
  via the confirmation dialog → correctly showed `REVOKED` with the
  reason and timestamp, confirmed via a fresh full-page reload (not
  just the transitional post-action DOM state, which briefly showed
  ambiguous text due to Server Action revalidation timing — a test
  artifact, not an app bug).
- A second revoke attempt was correctly blocked (button no longer
  offered, matching the already-revoked state).
- Institutions page correctly listed both real consortium members by
  display name, no raw MSP IDs shown.
- Zero browser console errors/warnings in the final run (after the
  `nativeButton` fix above) — checked explicitly, not assumed from a
  clean build alone.

**Result:** Phase 12 exit condition met — the full in-scope certificate
lifecycle UI is built, passes `tsc --noEmit`/`eslint`/`next build`
cleanly, and is proven working end-to-end in a real browser against the
live network, including the cross-org enforcement UI-gating that was
this phase's central trust-model requirement. Login is real-looking but
correctly non-authoritative, documented as such in three places.

**Follow-up:** no reusable browser-driven verification setup existed yet
for this frontend (a one-off Playwright script was hand-written this
phase) — worth turning it into a proper reusable script/harness
(dev-server-start, headless Chromium install, login helper) before the
next frontend-touching phase, so this setup doesn't need rediscovering.
No automated tests (unit or e2e) were added for the frontend itself,
matching the backend's same still-open gap from Phase 11.
Governance/voting UI and institution-onboarding UI remain explicitly
out of scope, per this phase's design decisions.

---

## Phase 13 — Backend API key + signed session cookie

**Goal:** close `ARCHITECTURE.md`'s Key decision #10 gap (no HTTP auth
on the backend) before cloud deployment, following a 2026-07-28 Slack
thread where Dominik and Neethu confirmed Azure/AKS deployment is now
the concrete next phase once the UI is done — no longer a hypothetical
future consideration.

**Design decisions, confirmed with the user before writing any code:**
1. Backend protection: a **shared API key per instance** (env var,
   checked via a global Nest guard), not a JWT-issuing login endpoint —
   fully closes the "zero-credential network-reachable caller" gap
   with far less new infrastructure, and matches the existing
   one-instance-per-institution architecture exactly.
2. Frontend login passwords: considered bcrypt-hashing them as part of
   "real auth," then **explicitly reverted** after review — the
   credential "store" here is the source file itself, so hashing
   wouldn't reduce any actual risk over the already-cosmetic plaintext
   comparison; kept scope to what was actually decided rather than
   applying a best-practice reflex that didn't address a real threat.
3. Frontend session cookie: **signing was kept, not reverted** — unlike
   password hashing, this closes a real, specific, and independently
   confirmed threat: the cookie previously stored a bare institutionId
   string with no signature, so any request could set
   `Cookie: blc_session=BLCFounderMSP` directly (institution IDs aren't
   secret) and obtain a full session with zero login. Because
   `getSession()` looks up that institution's real API key purely from
   the cookie's claimed institutionId, this was a genuine full
   authentication bypass into real, API-key-authenticated backend
   calls — not theoretical, and not the same category of "fix" as the
   password hashing that was rejected.

**Implementation:**
- Backend: `API_KEY` added to `env.validation.ts` (same
  `class-validator` pattern as existing fields); new
  `ApiKeyGuard` (`backend/src/common/guards/api-key.guard.ts`) checks
  `Authorization: Bearer <API_KEY>`, registered globally in `main.ts`
  via `app.useGlobalGuards()` so every route requires it by default. A
  real random key generated per instance, added to all three
  `.env.*` files (never committed) and `.env.example` (placeholder).
- Frontend: `lib/backend.ts`'s single `backendFetch()` choke point now
  sends the `Authorization` header on every backend call. `lib/
  institutions.ts` reads each instance's matching API key from
  `process.env` (a real secret, unlike the intentionally-plaintext
  cosmetic password) via a new `frontend/.env.local` (gitignored, with
  a committed `.env.local.example` documenting the required vars).
  `lib/session.ts` rewritten to sign an expiring JWT (`jose`, chosen
  specifically for Edge-runtime compatibility) into the cookie instead
  of a bare institutionId string; `getSession()` verifies signature and
  expiry, returning `undefined` on any failure rather than trusting the
  claim; `requireSession()` now calls `redirect("/login")` instead of
  throwing when `getSession()` fails, since an invalid session is now a
  real reachable case, not the "should be unreachable" theoretical one
  the old comment assumed.

**Bug found and fixed — invalid session cookie caused an infinite
redirect loop.** Full detail in `docs/ERROR_LOG.md`'s 2026-07-28 entry:
`proxy.ts`'s original cookie-*presence*-only check (previously correct,
since sessions couldn't be present-but-invalid) created a redirect loop
once forged/tampered cookies became possible — `/` saw the cookie as
present and passed the request through to `requireSession()`, which
correctly redirected to `/login`, but `/login` then saw the same
still-present invalid cookie and redirected straight back. Fixed by
having `proxy.ts` actually verify the JWT (not just check presence) and
clear the cookie on any verification failure, in both redirect
directions.

**Verification:** live end-to-end against the real running 3-org
network and all three rebuilt/restarted backend instances, driven by a
headless-browser script:
- `curl` with no `Authorization` header, and with a wrong key, both
  correctly returned `401`; the correct key returned `200` — confirmed
  directly against the backend, before involving the frontend at all.
- Full certificate lifecycle (login → issue → verify) still works
  exactly as before, now flowing transparently through the
  API-key-authenticated calls.
- Setting the old bare-institutionId cookie format directly (simulating
  the pre-signing forgery) correctly redirects to `/login` — confirmed
  via a real browser navigation and screenshot, not just an assumption
  from the code.
- A real session cookie with one character manually flipped (simulating
  tampering) was also correctly rejected and redirected to `/login`,
  confirming the signature check itself works, not just the
  missing-cookie case.
- Zero console errors across the full run.

**Result:** Phase 13 exit condition met — `ARCHITECTURE.md`'s Key
decision #10 is now implemented, not just documented as a prerequisite;
the newly-found session-forgery gap is closed and proven closed, not
just patched and assumed; and the scope stayed disciplined (password
hashing rejected on review as not addressing a real threat here, rather
than being added reflexively).

**Follow-up:** still institution-level identity only — no
per-human-user accounts, no token revocation, no rate-limiting on
login attempts. TLS/HTTPS termination and cloud secrets-manager (e.g.
Azure Key Vault) integration remain deployment-time concerns, not
addressed by this phase.

---

## Phase 14 — Full UI regression pass before sign-off

**Goal:** exhaustively test the frontend against a comprehensive
test-case list (login, dashboard, issue, detail, verify, revoke,
institutions, cross-org behavior, session security, error handling,
navigation, responsive layout) before declaring the certificate UI
complete — not just re-confirming the happy paths already proven in
Phases 12-13.

**Context:** before testing could start, the network was found in the
same recurring host-instability state documented multiple times this
project (CA/CouchDB/one orderer dead ~13h earlier, likely a host
sleep/restart) — full wipe, rebuild, redeploy, founder re-registration,
and re-onboarding `InstitutionB` via propose+vote (hit and recovered
from the usual MVCC race on the first vote, consistent with prior
occurrences). Both backend and frontend processes had also died and
needed restarting. This is now a well-understood, quickly-recoverable
class of issue, not a new problem.

**Testing approach:** a comprehensive Playwright script covering ~30
distinct test cases across every area of the app, run against the real
network/backend/frontend (not mocked), plus targeted manual scripts for
cases needing special setup (temporarily shortened JWT expiry, killing
a backend instance mid-test, direct cookie manipulation).

**Bug found and fixed — nav bar had no responsive/mobile layout at
all.** At a 390px viewport width, the top nav bar's links and
institution-name/logout controls rendered in one fixed horizontal row
with no wrapping or collapsing, forcing the *entire page* into
horizontal overflow — a real violation of "the page body must never
scroll horizontally." Fixed by adding a `md:hidden` / `hidden md:flex`
breakpoint split: nav links and logout collapse behind a hamburger
button below `md`, expanding into a stacked dropdown panel on tap, with
the existing desktop layout unchanged above `md`. Confirmed via
`document.documentElement.scrollWidth <= clientWidth` (no overflow) and
that the mobile menu's links are clickable and navigate correctly.

**Bug found in my own test script, not the app — during triage of a
different suspected failure, a leftover `button:has-text("")` "no-op
guard" selector (which trivially matches almost any button) clicked the
nav bar's Logout button instead of doing nothing, since `NavBar` renders
earlier in the DOM than the certificate detail page's own buttons. This
silently broke the session for every check after it in that run,
producing a misleading downstream test failure. Removed the bogus
selector; no app code was at fault.

**Investigated, concluded not a bug — certificate table appears to lose
its Status/Issued columns on narrow viewports.** `certificate-
table.tsx` wraps shadcn's `Table` component (which already provides its
own `overflow-x-auto` scroll container, `ui/table.tsx`) in a second,
redundant `overflow-x-auto` div. Measuring `.overflow-x-auto` by class
name alone is ambiguous with this double-nesting and returns the wrong
(outer, non-scrolling) element - confirmed via `[data-slot="table-
container"]` (the correct, inner element) that the real scroll
container genuinely does overflow (571px content in a 340px viewport)
and genuinely does scroll correctly when its `scrollLeft` is set, moving
the "Status" header fully into view. The double-wrapper was still
cleaned up (changed to `overflow-hidden rounded-lg border`, since the
outer div's only real job is clipping the inner scroll content to the
rounded corners, not scrolling itself) to remove the redundant/
misleading code, but the underlying scroll behavior was never actually
broken. **Flagged, not fixed:** there's no visual affordance (scrollbar,
edge fade) hinting that the table is horizontally scrollable on narrow
viewports — a discoverability polish item, not a functional bug.

**Found and fixed a stale code comment** (unrelated to any test
failure): `lib/session.ts`'s `requireSession()` still had a comment from
before the 2026-07-28 `proxy.ts` fix describing it as "the real
authorization boundary" because "`proxy.ts` only checks cookie
presence" — no longer true since that same day's redirect-loop fix made
`proxy.ts` verify the JWT too. Corrected the comment to describe the
current, accurate relationship (both verify independently; the
duplication is intentional defense-in-depth, not because one is
"shallow").

**Verification, all against the real running system:**
- Login: wrong password, unknown email, empty-form submission, and
  browser-back-after-logout all correctly rejected/blocked.
- Dashboard: genuine empty state confirmed on an institution
  (`InstitutionB`) with zero certificates; row-click navigation works.
- Issue: missing holder name/details both block submission; the
  metadata field-builder correctly handles multiple fields, a removed
  field, zero fields (metadata section omitted entirely), and a
  blank-key row (silently dropped, not sent).
- Certificate detail: copy-to-clipboard genuinely copies the correct
  certificate ID (verified via the real clipboard API, not assumed);
  an invalid certificate ID shows the friendly not-found message.
- Verify: nonexistent certificate ID shows the same friendly message.
- Revoke: Cancel button closes the dialog without revoking.
- Institutions: joined dates render as formatted dates, not raw ISO
  timestamps.
- Cross-org: `InstitutionA` can successfully verify a certificate
  issued by `BLCFounder` (verification is genuinely caller-agnostic,
  not just assumed from the chaincode's own "Caller: Anyone" doc
  comment).
- Session security: an expired JWT (tested by temporarily setting
  `SESSION_TTL` to `2s`, confirming rejection, then reverting to `8h`
  and confirming a normal session still persists) and logout's
  server-side cookie clearing (confirmed via the real cookie jar, not
  just the redirect) both behave correctly.
- Error handling: killing `InstitutionB`'s backend instance mid-test
  produced the exact intended copy ("Unable to reach Institution B's
  system right now..."), not a crash; a battery of malformed
  certificate IDs (path-traversal-style, a raw `<script>` tag, a
  500-character string) all rendered the same clean not-found state
  with no XSS execution and zero console errors.
- Navigation: every nav link (including the new mobile menu) verified
  working from a cold click-through, not assumed from earlier runs.

**Result:** Phase 14 exit condition met — every test case on the
pre-agreed checklist passed, one real bug (responsive nav) found and
fixed, one investigated-and-cleared false alarm (table scrolling), and
one stale doc comment corrected. The UI is now verified end-to-end
against its own real dependencies, not mocks, across both desktop and
mobile viewports.

**Follow-up:** the table-scroll discoverability gap (no visual hint
that Status/Issued columns are reachable by scrolling on narrow
screens) is a legitimate future polish item, deliberately left open
rather than adding UI scope unprompted mid-regression-pass.

## Phase 15 — Azure staging deployment (2026-08-10)

**Goal:** stand up a real, externally-reachable staging environment for
`agentic-qa` to eventually target — the full stack (Fabric network, both
chaincodes, all 3 backend instances, frontend) on a single Azure VM,
reachable over real HTTPS. Not AKS — a deliberate scope decision (see
project memory `project_blc31_agentic_qa_azure_direction`): the minimal
footprint to unblock `agentic-qa`, not a production topology.

**Subscription/resource group.** Reused the existing `farmkube 2026-05`
subscription (Espeo tenant), already authenticated via `az` CLI —
confirmed before creating anything:

```bash
az account show --output table
az group list --output table
az group create --name blc31-staging-rg --location northeurope --output table
```

Only pre-existing group was `NetworkWatcherRG` (an Azure system-managed
group, not for application resources) — created a dedicated
`blc31-staging-rg` so the whole environment can be torn down with one
`az group delete` later.

**Networking — Public IP with DNS label, VNet/subnet, NSG with exactly 3
inbound rules.** Deliberately no Load Balancer: confirmed directly
against Microsoft's own Public IP docs that a VM's network interface can
hold a Standard SKU public IP directly — Load Balancer is only needed to
distribute traffic across *multiple* VMs, not for a single-VM setup.
Also confirmed Azure VNets themselves are free (no cost), and (per the
2026-08-10 Slack thread that authorized this deployment) FarmKube's own
prior Azure cost breakdown showed Load Balancer (€77.60 of €144.82
total) as the dominant fixed cost — avoiding it here was a deliberate,
evidence-based choice, not an assumption.

```bash
az network vnet create \
  --resource-group blc31-staging-rg --name blc31-staging-vnet-we \
  --location westeurope --address-prefix 10.10.0.0/16 \
  --subnet-name blc31-staging-subnet-we --subnet-prefix 10.10.1.0/24

az network nsg create \
  --resource-group blc31-staging-rg --name blc31-staging-nsg-we --location westeurope

az network nsg rule create --resource-group blc31-staging-rg --nsg-name blc31-staging-nsg-we \
  --name allow-https --priority 100 --direction Inbound --access Allow --protocol Tcp \
  --source-address-prefixes '*' --source-port-ranges '*' --destination-port-ranges 443

az network nsg rule create --resource-group blc31-staging-rg --nsg-name blc31-staging-nsg-we \
  --name allow-http --priority 110 --direction Inbound --access Allow --protocol Tcp \
  --source-address-prefixes '*' --source-port-ranges '*' --destination-port-ranges 80

az network nsg rule create --resource-group blc31-staging-rg --nsg-name blc31-staging-nsg-we \
  --name allow-ssh-my-ip --priority 120 --direction Inbound --access Allow --protocol Tcp \
  --source-address-prefixes <admin-IP>/32 --source-port-ranges '*' --destination-port-ranges 22

az network public-ip create \
  --resource-group blc31-staging-rg --name blc31-staging-pip-we --location westeurope \
  --sku Standard --allocation-method Static --dns-name blc31-staging
```

443/80 open to `Any` (443 for the actual traffic including `agentic-qa`'s
GitHub-Actions-runner-driven browser; 80 only for the ACME HTTP-01
challenge + HTTP→HTTPS redirect). 22 restricted to the admin's own `/32`
— the one deliberate asymmetry, confirmed correct via
`az network nsg rule show` after creation (source showed the specific
IP, not `*`). Backend ports (3001-3003) and every Fabric port (peer,
orderer, CouchDB, CA) never got an inbound rule at all — same trust
model as the existing `ApiKeyGuard` (network-reachable = dangerous),
just enforced one layer lower now too. The Public IP's DNS label
(`blc31-staging` → `blc31-staging.westeurope.cloudapp.azure.com`) is
Azure's own free feature — chosen specifically over Let's Encrypt's
newer (2026-01, GA) short-lived IP-address certificates, since Caddy's
own docs confirm IP certs aren't its zero-config path (falls back to a
self-signed internal CA for non-public/IP hosts) and the 160-hour
lifetime is meaningfully more fragile than a normal domain cert's 90-day
cycle — a real domain-style hostname sidesteps that entirely, for free.

**VM creation — a real, multi-attempt saga, not a clean first pass. Full
blow-by-blow in `docs/ERROR_LOG.md`'s 2026-08-10 "VM SKU/quota/capacity"
entry.** `Standard_B2ms` (the originally-planned size, chosen for its
8GB memory target after explicitly rejecting `B2s`'s tighter 4GB margin)
failed with `SkuNotAvailable` in `northeurope`. Escalating size within
the same family (`B4ms`) and switching families (`F4s_v2`) both failed
the same way, still in `northeurope`. Switching region to `westeurope`
(larger, more heavily-provisioned) hit the identical failure for both
`B2ms` and `F4s_v2` again, then a *different* failure — `QuotaExceeded`
(not capacity) for `Standard_B4s_v2`, `Current Limit: 0`. Cross-
referencing `az vm list-usage` (per-family quota) against `az vm
list-skus` (what's actually offered) revealed the real cause: this
subscription's catalog only includes newer VM hardware generations —
every size tried was from an older generation genuinely absent from the
catalog, not capacity-constrained or quota-blocked in the way the error
messages implied at face value. `Standard_F4as_v6` was the first size
confirmed *both* present in the catalog *and* quota-approved (`Fasv6`
family, limit 10) — succeeded on the first attempt once picked correctly.

```bash
az vm create \
  --resource-group blc31-staging-rg --name blc31-staging-vm --location westeurope \
  --image Canonical:ubuntu-24_04-lts:server:latest --size Standard_F4as_v6 \
  --admin-username azureuser --generate-ssh-keys \
  --public-ip-address blc31-staging-pip-we --nsg blc31-staging-nsg-we \
  --vnet-name blc31-staging-vnet-we --subnet blc31-staging-subnet-we \
  --os-disk-size-gb 64 --storage-sku StandardSSD_LRS
```

**Host prerequisites.** Ubuntu 24.04 LTS ships with none of this
project's tooling — installed explicitly, versions pinned to match
`deployment/local.yaml` rather than "latest":

```bash
# Docker (official apt repo, not the convenience script)
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker azureuser

# GitHub CLI (to clone the private repo)
sudo apt-get install -y gh
gh auth login   # interactive, browser device-flow

# Hyperledger Fabric binaries, pinned to this repo's exact versions
sudo apt-get install -y jq python3-yaml
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.0 --ca-version 1.5.15 b
echo 'export PATH=$PATH:$HOME/fabric-install/bin' >> ~/.bashrc

# Go (matching network/go.mod's `go 1.25.0`)
curl -sSLO https://go.dev/dl/go1.25.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.25.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc

# Node.js 22 (backend requires >=20.9.0)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Cloned `origin/main` (not the local working copy) — deliberately.**
The local machine had uncommitted changes to `network.yaml`/`local.yaml`
from an unrelated same-day governance-gap investigation (a 4th
institution, `InstitutionD`, added via `org-add.sh` to test a live
onboarding scenario — never committed). Cloning `origin/main` on the VM
naturally excluded that org and gave the clean, already-proven 3-org
topology (`BLCFounder`/`InstitutionA`/`InstitutionB`) instead — confirmed
via `git status` on the local machine before cloning, not assumed.

```bash
gh repo clone neethumuthu/BLC-Consortium-MVP
```

**Network bootstrap — one real bug, full detail in `docs/ERROR_LOG.md`'s
2026-08-10 "root-owned crypto/ directory" entry.** `blcgen validate`
passed; `network.sh up` failed at stage 3 (crypto enrollment) with
`mkdir: cannot create directory '.../crypto/ca-bootstrap': Permission
denied` — Docker (running as root) had auto-created `crypto/` as a side
effect of the CA containers' bind mounts starting before
`bootstrap-crypto.sh`'s own `mkdir -p` ran. Fixed by stopping the
partially-started containers, wiping the root-owned state, and
pre-creating `crypto/ca-servers/<org>` for all 4 orgs as `azureuser`
*before* retrying — so Docker found existing, correctly-owned
directories instead of auto-creating new root-owned ones.

```bash
docker compose -f generated/docker-compose-ca.yaml down -v
sudo rm -rf crypto generated channel-artifacts
mkdir -p crypto/ca-servers/{BLCOrderer,BLCFounder,InstitutionA,InstitutionB}
./scripts/network.sh up
```

Second attempt succeeded cleanly through all 10 stages — 3 orderers, 3
orgs × 2 peers × 2 (peer+CouchDB), channel `blcchannel` created and
joined by all 6 peers, membership verified (identical block hash across
all).

**Chaincode deployment — clean, no new bugs** (this exact deploy path
was already proven in Phases 7-8; only the target network was new).

```bash
FOUNDING_MSPS_JSON=$(python3 -c "
import json, yaml
net = yaml.safe_load(open('config/network.yaml'))
print(json.dumps([o['msp'] for o in net['organizations'] if o['status'] == 'founding']))
")
./scripts/chaincode.sh deploy institution-cc --init-function InitLedger --init-args "$FOUNDING_MSPS_JSON"
./scripts/chaincode.sh deploy certificate-cc
```

**Governance bootstrap — full local parity, not just a minimal 2-org
setup.** `RegisterInstitution` is bootstrap-only (never exposed via the
backend's REST API, confirmed by its absence from the route list printed
at NestJS startup) — invoked directly via `peer chaincode invoke` for
both founding orgs, then `InstitutionB` (a `member`, not `founding`,
per `network.yaml`) properly proposed and voted in through the real
governance flow rather than force-registered:

```bash
# RegisterInstitution, once per founding org (BLCFounder, InstitutionA),
# each as that org's own Admin identity — see git history for the full
# CORE_PEER_*/peer chaincode invoke invocation.
peer chaincode invoke ... -c '{"function":"RegisterInstitution","Args":["BLC Founder"]}' ...
peer chaincode invoke ... -c '{"function":"RegisterInstitution","Args":["Institution A"]}' ...

# InstitutionB proposed by BLCFounder, then voted in by both (majority of 2 = 2)
peer chaincode invoke ... -c '{"function":"ProposeNewMember","Args":["InstitutionBMSP","Institution B"]}' ...
peer chaincode invoke ... -c '{"function":"CastVote","Args":["<proposalId>","yes"]}' ...   # as BLCFounder
peer chaincode invoke ... -c '{"function":"CastVote","Args":["<proposalId>","yes"]}' ...   # as InstitutionA — crosses the 2/2 threshold, InstitutionB auto-created
```

All 3 institutions confirmed `status: active` on the ledger after this —
matching local dev's governance state exactly, by design (see Decisions
below on why the full footprint was chosen over the originally-scoped
minimal one).

**Backend + frontend — built, then run as `systemd` services, not bare
background processes.** A staging target needs to survive reboots and
crashes unattended; `nohup`-style processes (fine for local dev) aren't
appropriate here.

```bash
cd backend && npm install && npm run build
# .env.blcfounder / .env.institutiona / .env.institutionb created with
# fresh (VM-generated, not copied from local) API_KEY values, same
# shape as the existing local .env.* files.
sudo systemctl enable --now blc-backend-blcfounder blc-backend-institutiona blc-backend-institutionb

cd ../frontend && npm install && npm run build
```

**One real bug in the deployment sequence, not the app — `next build`
failed on first attempt.** `Error: Missing required env var
BLCFOUNDER_API_KEY` during static page-data collection for
`/certificates/new` — the frontend's own strict env-var validation
(`getOrThrow`-style, same pattern as the backend) runs even at build
time, not just at request time, and `.env.local` hadn't been created
yet at that point in the sequence. Fixed by creating `.env.local` (keys
pulled directly from the already-created backend `.env.*` files, so the
real values never needed retyping or re-display) before rebuilding —
second attempt succeeded, all 10 routes compiled. Full detail in
`docs/ERROR_LOG.md`.

```bash
sudo systemctl enable --now blc-frontend
```

**Caddy — reverse proxy + real, automatic Let's Encrypt HTTPS, zero
custom TLS handling.**

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
blc31-staging.westeurope.cloudapp.azure.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy's logs confirmed the full ACME sequence live — new account
registration, `http-01` challenge solved, certificate obtained — with
no manual certificate handling anywhere in this setup.

**Verification — from genuinely outside the VM, not just internally.**
A `curl` run from *inside* the VM's own SSH session returning `200`
was correctly treated as necessary-but-not-sufficient (it still proves
DNS/TLS/proxy/app all work, since even same-host traffic to a public
hostname routes out through the real internet — but doesn't rule out
some host-specific routing quirk). Re-ran from the admin's own laptop,
outside any SSH session entirely:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://blc31-staging.westeurope.cloudapp.azure.com/login
```

`200`, confirmed from the real outside world.

**Closed the loop — `agentic-qa.yml`'s actual blocker.** Set the
`STAGING_URL` repository variable it already reads via
`${{ vars.STAGING_URL }}` (confirmed by reading the workflow file
directly — a plain string, no parsing, no path construction):

```bash
gh variable set STAGING_URL --body "https://blc31-staging.westeurope.cloudapp.azure.com"
```

**Decisions made during this phase, not just execution:**
- **Full 3-org footprint, not the originally-scoped minimal 2-org/
  1-orderer/1-peer topology.** The minimal footprint was scoped back
  when VM sizing was still an open question (would anything even fit).
  Once `F4as_v6` (4 vCPU/8GB) was confirmed working, the resource-fit
  concern that motivated trimming no longer applied — deploying the
  same, already-proven `network.yaml`/`local.yaml` as local dev removes
  a variable (config-editing mistakes) from any future debugging, and
  gives `agentic-qa` a real 3-institution topology to test
  cross-institution scenarios against, not an artificially simplified
  stand-in.
- **No Load Balancer, single VM with a directly-attached Public IP** —
  confirmed sufficient and correct per Microsoft's own docs, not an
  improvised workaround.
- **DNS label over Let's Encrypt's newer IP-address certificates** —
  the free, standard, well-tested path over a technically-newer but more
  operationally fragile one (160-hour cert lifetime vs. 90 days).
- **`systemd` services, not background processes**, for anything meant
  to stay up unattended (backend ×3, frontend, Caddy).

**Follow-up, explicitly not done in this phase:** `.github/qa-mcp.json`
(the Playwright MCP config `agentic-qa.yml` actually needs to drive a
browser) and `SLACK_WEBHOOK_QUALITY` are both still genuinely missing —
`STAGING_URL` alone doesn't make `agentic-qa` runnable yet. The
`northeurope` VNet/subnet/NSG (abandoned mid-region-switch) are orphaned
but free — cleanup deferred, not forgotten. Security posture of the
live URL (port 443 open to `Any`, no rate-limiting on the login system,
per `ARCHITECTURE.md`'s own existing note) was flagged directly to the
user as an accepted, deliberate tradeoff for a short-lived QA target —
not something to leave running indefinitely unreviewed.

## Phase 16 — Staging wipe and fresh redeploy (2026-08-11)

**Why:** by this point staging had accumulated real, permanent-in-the-ledger
QA test data with no way to remove any of it at the chaincode level — two
fake institutions (`InstitutionQAMSP`, `QARing3CandMSP`) from `agentic-qa`'s
own real-vote incident, a membership proposal (`GovVerifyMSP`, created while
verifying `governance-vote-status`) that was mathematically stuck open
forever once those two phantom institutions inflated the real quorum, and
five QA-labeled certificates from Ring 3 lifecycle testing. Checked first
that `institution-cc` has no deactivate/remove-institution or
cancel-proposal function — confirmed it doesn't (only 4 mutating functions
exist total: `InitLedger`, `RegisterInstitution`, `ProposeNewMember`,
`CastVote`). Checked `certificate-cc` for anything of real value before
wiping (`GetCertificatesByInstitution` for all 3 real institutions) — all 5
certificates found were clearly QA test artifacts, nothing genuine lost.

**Sequence, same process as the original Phase 15 standup:**

```bash
# Paused agentic-qa's nightly schedule first - staging is inconsistent
# during a wipe/redeploy window.
./scripts/network.sh down --wipe
./scripts/network.sh up
```

Confirmed a clean genesis state before touching chaincode: all 6 peers
joined `blcchannel` with identical block hash, height 1.

**A real gotcha, not the same one as Phase 15's version-bump trap.**
`chaincode.sh`'s `CC_VERSION`/`CC_SEQUENCE` were `1.2`/`2` in git — correct
for *local's* history (from the `governance-vote-status` chaincode
redeploy), wrong for staging's fresh channel, which needs sequence 1.
Fixed on staging's own checkout only (`sed -i` on `chaincode.sh`, never
pushed) — the same "verify the real committed state per network, don't
trust the tracked file blindly" discipline already documented for this
exact file. Redeployed both chaincodes at `1.0`/sequence `1`,
`institution-cc` *with* `--init-function InitLedger` this time (a genuinely
fresh channel needs it — unlike the earlier upgrade-in-place redeploy,
which deliberately omitted it to avoid retriggering `InitLedger`'s own
already-initialized guard).

**A second, more significant real bug found and fixed during the
governance bootstrap:** hand-constructed `peer chaincode invoke` calls for
`RegisterInstitution`/`ProposeNewMember`/`CastVote` (these three are
bootstrap-only, never exposed via the backend's Fabric Gateway SDK, which
handles multi-org endorsement automatically) were built with only ONE
org's `--peerAddresses`/`--tlsRootCertFiles` pair. The channel's actual
`Application` endorsement policy is `ImplicitMeta: "MAJORITY Endorsement"`
(confirmed directly in `generated/configtx.yaml`) — a majority of the 3
orgs, i.e. 2, each satisfying their own `OR('OrgMSP.peer')` policy. A
single-org-endorsed transaction passes simulation cleanly (the CLI prints
"Chaincode invoke successful" with a real, correct-looking payload) but
silently fails validation at commit time and is never actually written to
the ledger — confirmed by immediately re-querying `GetAllInstitutions`
after a "successful" `RegisterInstitution` call and finding it empty,
twice, reproducibly, with clean (non-garbled) single-command verification.
Fixed by adding a second org's `--peerAddresses`/`--tlsRootCertFiles` pair
to every mutating bootstrap call. Every write was independently re-verified
with a follow-up read before proceeding to the next step, not assumed from
the CLI's own "successful" message — exactly the discipline that caught
this in the first place.

**Result:** `RegisterInstitution` for BLCFounder and InstitutionA, then a
real `ProposeNewMember`/`CastVote` flow bringing InstitutionB in with a
real 2/2 majority — confirmed via `GetAllInstitutions` showing exactly the
3 real institutions, all active, nothing else. Backend (×3) and frontend
restarted (code already current, no rebuild needed — only the network
underneath changed). Re-verified live: `/institutions` shows exactly 3 rows;
`governance-vote-status`'s propose/vote/Recently-closed flow works
correctly against the fresh, non-inflated quorum (`totalEligibleVoters: 3`,
not 5); `QA_GUEST`'s read-only guard still rejects a write attempt (its
config lives in `.env` files, untouched by the network wipe). A test
proposal created during verification was voted to a clean `Rejected`
resolution rather than left stuck open, unlike the pre-wipe incident.
`agentic-qa`'s nightly schedule re-enabled once all of the above was
confirmed.

## Phase 17 — AI SDLC Brownfield Rollout: Stage D/F/G solo-doable follow-ups (2026-08-12)

Closed out everything from the Brownfield Rollout tutorial's Stages D, F,
and G that doesn't require the live team workshops in Stage E (explicitly
parked, not attempted). Read the tutorial's own five PDF pages directly for
the first time this pass — earlier evaluation work had been done from a
second-hand description of it (see `docs/AI_SDLC_STAGE_B_EVALUATION_REPORT.md`'s
own scope note on that gap).

**Stage D, verified rather than assumed broken:** the GitHub Project
("BLC-31 AI SDLC Board", #2) already had the exact `Stage`/`Change-ID`/
`AI-assist` fields the tutorial specifies, and `project-sync.yml` already
targeted that real board, not the leftover "project-sync test board" (#1).
No fix needed for either. Branch protection remains hard-blocked — `gh api
repos/.../branches/main/protection` returns `403 Upgrade to GitHub Pro or
make this repository public`, unchanged from the earlier audit.

**`capture-learning`, run for real this time, not just scoped.** Created
`context/learnings/LEARNINGS.md` with its first genuine entry — the
single-org-endorsement silent-commit bug from Phase 16 — and graduated it
into `context/rules/general.md` as rule 9, per the skill's own step 4
(unambiguous, permanent, not a one-off).

**Stage F's `/opsx:onboard` is a real tooling gap, not something to fake.**
Confirmed absent from both the starter-kit's shipped commands and this
project's installed `.claude/commands/opsx/` (which has only apply/archive/
explore/propose/sync/update). Stubbed `openspec/specs/certificate-lifecycle/
spec.md` by hand instead — a real, shipped, previously-unspec'd capability —
using proper Requirements/Scenarios (a plain-prose "one-paragraph stub" as
the tutorial literally describes doesn't pass `openspec validate --strict`,
which requires at least one Scenario per Requirement). Marked
`confidence: low` and flagged for the human review the tutorial calls for
before this graduates to a real reconstructed spec.

**`context/product/PRODUCT.md` and `DOMAIN.md` drafted for the first time**
— both directories didn't exist before today. Both explicitly marked as
placeholders (`confidence: low`, `owner: unassigned`) pending the real
Stage E workshop, not presented as a PM/PO's actual sign-off. Drafting
`PRODUCT.md`'s "what we are NOT building" section surfaced a third real
`context/CONFLICTS.md` row: `V1_PHASE_OVERVIEW.md`'s "governance/voting via
the API is out of scope for v1.0" claim is now false, superseded by the
`governance-vote-status` feature (issue #8, archived 2026-08-11) — the
original 2026-07-30 `doc-archaeology` pass predates that feature by twelve
days, so it couldn't have caught this one.

**Stage D5, actually tested — and a real bug found in the process.** Opened
PR #11 for this batch instead of pushing straight to `main`, specifically to
exercise the Ring 2 gate (`ai-pr-review.yml`) for real. It completed
"success" twice in a row while posting zero comments — see
`docs/ERROR_LOG.md`'s entry for the diagnosis and fix. PR #11 merged clean
after the fix landed on `main`.

**Still open, not attempted:** Stage E's live team workshops (explicitly
out of scope for this pass); Stage G's project-board Stage-field sync,
Friday operating reviews, and ongoing `capture-learning` cadence — none of
these are demonstrable from a single solo session, they need real usage
over time.
