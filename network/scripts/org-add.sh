#!/usr/bin/env bash

# org-add.sh — onboards a "pending" organization (network.yaml) into the
# already-running network: crypto enrollment, container startup, channel
# config-update, chaincode install+approve for institution-cc AND
# certificate-cc, and finally flips its status to "member". This is the
# Runtime pipeline (see ARCHITECTURE.md's two-pipeline model) — it must
# never touch `blcgen generate` or restart the network, so crypto and
# containers are brought up incrementally here, not through the
# bootstrap pipeline's generated compose files.
#
# Usage:
#   ./org-add.sh <org-name>
#   ./org-add.sh teardown   — removes every non-founding org's CA/peer/
#                             CouchDB containers (see cmd_teardown below);
#                             called by network.sh's down --wipe, same as
#                             chaincode.sh's own teardown verb.
#
# Prerequisite this script does NOT drive itself: the org must already
# be an active Institution in institution-cc's ledger — i.e. an existing
# active institution has already called ProposeNewMember and enough
# institutions have CastVote to approve it. That is a deliberate,
# multi-institution governance act, not something a single script should
# trigger. org-add.sh's own first stage verifies this passed; it does
# not assume it and does not perform the vote itself.
#
# Stage order (7 stages) and why each is where it is:
#   1. Fail-closed guard — confirm the vote already passed, before any
#      expensive or risky work below runs.
#   2. Crypto enrollment + container startup for the new org.
#   3. Channel config-update: inject the new org's MSP definition,
#      signed by the EXISTING orgs' admins (the org being added has no
#      on-channel identity yet to sign with itself).
#   4. Anchor peer update — a SEPARATE config-update, signed by the new
#      org's own admin this time, which only exists after stage 3
#      commits.
#   5. Peer channel join, using the channel's ORIGINAL genesis block —
#      confirmed live (docs/ERROR_LOG.md) that Fabric refuses any other
#      block number for a peer's first join; it syncs forward to the
#      current state afterward via normal orderer delivery.
#   6. Install and approve BOTH institution-cc and certificate-cc for
#      the new org — confirmed against Fabric's own docs (see
#      docs/BUILD_LOG.md's Phase 9 entry) that a late-joining org must
#      explicitly approve an already-committed chaincode, not just
#      install it, before its own peers can execute it. This approval is
#      not always mere catch-up, either: if this org's stage 3 already
#      ran before some chaincode was deployed, that chaincode's own
#      commit by the founding orgs CANNOT succeed without this org's
#      approval too — checkcommitreadiness counts every CURRENT
#      Application-group member, regardless of network.yaml's own
#      "pending" status. Confirmed live — see docs/ERROR_LOG.md's
#      certificate-cc entry. Deploy every chaincode a consortium needs
#      BEFORE onboarding new orgs to avoid depending on this ordering.
#   7. Flip network.yaml's status from pending to member — LAST, after
#      every prior stage has actually succeeded, so a failure anywhere
#      above leaves network.yaml untouched and this script safely
#      re-runnable, same "fail loud, don't half-commit" discipline as
#      network.sh/chaincode.sh.

cd "$(dirname "${BASH_SOURCE[0]}")/.."
source "scripts/lib/common.sh"
source "scripts/lib/crypto.sh"
source "scripts/lib/orgs.sh"
source "scripts/lib/chaincode.sh"

CHANNEL_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['channel']['name'])")
ORDERER_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['orderer']['name'])")
ORDERER_GENERAL_PORT=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['orderer']['nodes'][0]['general_port'])")
ORDERER_TLS_CA="${CRYPTO_DIR}/organizations/${ORDERER_NAME}/orderers/orderer0/tls/ca.pem"

# CC_VERSION/CC_SEQUENCE match chaincode.sh's own fixed, documented
# design decision — "this script only ever commits at sequence 1,
# version 1.0" — so a new org approves against exactly the same
# version/sequence every existing chaincode was actually committed at.
CC_VERSION="1.0"
CC_SEQUENCE="1"

CURRENT_STAGE=0
CURRENT_STAGE_NAME=""

stage() {
  CURRENT_STAGE="$1"
  CURRENT_STAGE_NAME="$2"
  log "stage ${CURRENT_STAGE}/7: ${CURRENT_STAGE_NAME}"
}

on_add_error() {
  local exit_code=$?
  echo "[org-add] command failed: ${BASH_COMMAND} (exit ${exit_code})" >&2
  echo "[org-add] FAILED at stage ${CURRENT_STAGE}: ${CURRENT_STAGE_NAME} — ${ORG_NAME}'s status in ${NETWORK_YAML} is still 'pending', not changed until every stage succeeds; safe to re-run './scripts/org-add.sh ${ORG_NAME}' directly" >&2
  exit "$exit_code"
}

# require_active_institution queries institution-cc's own ledger — via
# an EXISTING active org's peer, since the org being added has no peer
# of its own yet — to confirm its governance vote already passed. Fails
# closed: refuses every later stage (crypto enrollment, container
# startup, channel reconfiguration) if the target org was never actually
# approved, rather than assuming this script is only ever invoked at the
# right time.
require_active_institution() {
  local org_msp="$1"

  local first_org first_msp first_peer_port
  read -r first_org first_msp <<< "$(active_org_lines | head -1)"
  read -r _ first_peer_port <<< "$(org_peer_lines "$first_org" | head -1)"

  # GetInstitution is EXPECTED to fail (nonzero exit) for an org that
  # hasn't been proposed/approved yet — that's the normal "not yet
  # active" case this function exists to detect, not a script bug. The
  # trailing `|| true` stops that expected failure from tripping set -e
  # at this assignment; the python step below is what actually decides
  # pass/fail and produces the specific message, so it must be reached
  # regardless of this query's own exit code.
  local response
  response=$(FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$first_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
      peer chaincode query \
        -C "$CHANNEL_NAME" -n institution-cc \
        -c "{\"function\":\"GetInstitution\",\"Args\":[\"${org_msp}\"]}" 2>&1) || true

  echo "$response" | python3 -c "
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    print('${org_msp} is not a registered institution yet — the governance vote (ProposeNewMember/CastVote) must pass before running org-add.sh. institution-cc said: ' + raw.strip(), file=sys.stderr)
    sys.exit(1)
if data.get('status') != 'active':
    print('${org_msp} exists in institution-cc but is not active (status: ' + str(data.get('status')) + ')', file=sys.stderr)
    sys.exit(1)
print('confirmed: ${org_msp} is an active institution (joined ' + str(data.get('joinedAt')) + ')')
"
}

# start_org_ca (re)starts ORG_NAME's Fabric CA container via a plain
# docker run — matches docker-compose-ca.yaml.tmpl's per-org service
# shape exactly (same env vars, same volume), assembled directly rather
# than through blcgen generate (ARCHITECTURE.md forbids org-add.sh
# touching that command). Removes any existing container of the same
# name first, so this is safe to re-run.
start_org_ca() {
  local org_name="$1" ca_port="$2" ca_version="$3"
  local container_name="ca.${org_name}"

  docker rm -f "$container_name" >/dev/null 2>&1 || true
  # No mkdir here: docker itself creates a missing bind-mount source
  # directory on first use (as root, since the CA process inside the
  # container runs as root) — exactly how crypto/ca-servers/BLCFounder/
  # InstitutionA came to exist, with no script ever creating them
  # directly. A manual `mkdir -p` here fails with Permission denied,
  # since crypto/ca-servers/ itself is already root-owned from that
  # same mechanism (see docs/ERROR_LOG.md's 2026-07-06 entry on
  # root-owned crypto material) — found the hard way live-testing this
  # exact stage.

  log "starting ${container_name} on port ${ca_port}"
  docker run -d \
    --name "$container_name" \
    --network blc \
    -e FABRIC_CA_SERVER_HOME=/etc/hyperledger/fabric-ca-server \
    -e FABRIC_CA_SERVER_TLS_ENABLED=false \
    -e FABRIC_CA_SERVER_CA_NAME="ca-${org_name}" \
    -p "${ca_port}:7054" \
    -v "${CRYPTO_DIR}/ca-servers/${org_name}:/etc/hyperledger/fabric-ca-server" \
    "hyperledger/fabric-ca:${ca_version}" \
    sh -c 'fabric-ca-server start -b admin:adminpw' >/dev/null
}

# start_org_couchdb (re)starts one peer's CouchDB container — matches
# docker-compose-net.yaml.tmpl's couchdb service shape exactly.
start_org_couchdb() {
  local org_name="$1" peer_name="$2" couchdb_port="$3" couchdb_user="$4" couchdb_password="$5"
  local container_name="couchdb.${peer_name}.${org_name}"

  docker rm -f "$container_name" >/dev/null 2>&1 || true

  log "starting ${container_name} on port ${couchdb_port}"
  docker run -d \
    --name "$container_name" \
    --network blc \
    -e COUCHDB_USER="$couchdb_user" \
    -e COUCHDB_PASSWORD="$couchdb_password" \
    -p "${couchdb_port}:5984" \
    couchdb:3.3 >/dev/null
}

# start_org_peer (re)starts one peer container — matches
# docker-compose-net.yaml.tmpl's per-peer service exactly (same env
# vars, same volumes, same restart policy), assembled directly instead
# of through blcgen generate.
start_org_peer() {
  local org_name="$1" org_msp="$2" peer_name="$3" peer_port="$4" \
    couchdb_user="$5" couchdb_password="$6" fabric_version="$7" gossip_bootstrap="$8"
  local container_name="${peer_name}.${org_name}"

  docker rm -f "$container_name" >/dev/null 2>&1 || true

  local gossip_flag=()
  [ -n "$gossip_bootstrap" ] && gossip_flag=(-e "CORE_PEER_GOSSIP_BOOTSTRAP=${gossip_bootstrap}")

  log "starting ${container_name} on port ${peer_port}"
  docker run -d \
    --name "$container_name" \
    --hostname "$container_name" \
    --restart unless-stopped \
    --network blc \
    --workdir /root \
    -e FABRIC_LOGGING_SPEC=INFO \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/signcerts/cert.pem \
    -e CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/key.pem \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.pem \
    -e CORE_PEER_GOSSIP_USELEADERELECTION=true \
    -e CORE_PEER_GOSSIP_ORGLEADER=false \
    -e CORE_LEDGER_STATE_STATEDATABASE=CouchDB \
    -e CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock \
    -e CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=blc \
    -e CORE_PEER_ID="${container_name}" \
    -e CORE_PEER_ADDRESS="${container_name}:${peer_port}" \
    -e CORE_PEER_LISTENADDRESS="0.0.0.0:${peer_port}" \
    -e CORE_PEER_CHAINCODEADDRESS="${container_name}:7052" \
    -e CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:7052 \
    -e CORE_PEER_LOCALMSPID="$org_msp" \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp \
    -e CORE_PEER_GOSSIP_EXTERNALENDPOINT="${container_name}:${peer_port}" \
    -e CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS="couchdb.${container_name}:5984" \
    -e CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME="$couchdb_user" \
    -e CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD="$couchdb_password" \
    "${gossip_flag[@]}" \
    -p "${peer_port}:${peer_port}" \
    -v "${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/msp:/etc/hyperledger/fabric/msp" \
    -v "${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls:/etc/hyperledger/fabric/tls" \
    -v "/var/run/docker.sock:/host/var/run/docker.sock" \
    "hyperledger/fabric-peer:${fabric_version}" \
    peer node start >/dev/null
}

# bring_up_org_containers stands up org_name's CA, enrolls its crypto
# material (lib/crypto.sh's bootstrap_org — the exact same function
# bootstrap-crypto.sh uses for every founding/member org, called here
# for just this one new org), then starts its CouchDB(s) and peer(s).
# Every step is safe to re-run — each start_* helper removes any
# existing container of the same name first.
bring_up_org_containers() {
  local org_name="$1" org_msp="$2"

  local fabric_version ca_version couchdb_user couchdb_password ca_port peer_count
  fabric_version=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['fabric_version'])")
  ca_version=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['ca_version'])")
  couchdb_user=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['couchdb_admin_user'])")
  couchdb_password=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['couchdb_admin_password'])")
  ca_port=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['organizations']['${org_name}']['ca_port'])")
  peer_count=$(python3 -c "import yaml; print(len(yaml.safe_load(open('${LOCAL_YAML}'))['organizations']['${org_name}']['peers']))")

  start_org_ca "$org_name" "$ca_port" "$ca_version"
  wait_for_ca "$ca_port"

  bootstrap_org "$org_name" "$org_msp" "$ca_port" "peer" "$peer_count"

  # Every peer needs every OTHER peer in its own org for gossip
  # discovery bootstrap — same algorithm as blcgen's own
  # BuildComposeData (network/internal/generate/compose_data.go),
  # computed here in Python instead of Go since this org's containers
  # are never generated by blcgen.
  local lines
  mapfile -t lines < <(python3 -c "
import yaml
dep = yaml.safe_load(open('${LOCAL_YAML}'))
peers = dep['organizations']['${org_name}']['peers']
addrs = [f'peer{i}.${org_name}:{p[\"peer_port\"]}' for i, p in enumerate(peers)]
for i, p in enumerate(peers):
    bootstrap = ','.join(a for j, a in enumerate(addrs) if j != i)
    print(f'peer{i} {p[\"peer_port\"]} {p[\"couchdb_port\"]} {bootstrap}')
")

  local line peer_name peer_port couchdb_port gossip_bootstrap
  for line in "${lines[@]}"; do
    read -r peer_name peer_port couchdb_port gossip_bootstrap <<< "$line"
    start_org_couchdb "$org_name" "$peer_name" "$couchdb_port" "$couchdb_user" "$couchdb_password"
  done
  for line in "${lines[@]}"; do
    read -r peer_name peer_port couchdb_port gossip_bootstrap <<< "$line"
    start_org_peer "$org_name" "$org_msp" "$peer_name" "$peer_port" \
      "$couchdb_user" "$couchdb_password" "$fabric_version" "$gossip_bootstrap"
    wait_for_port "$peer_port"
  done
}

# fetch_current_config downloads and decodes the channel's current
# config into output_json — via an EXISTING active org's own peer,
# since that's the only kind of identity guaranteed to already be a
# channel member. Every sequence below (fetch, decode, jq-modify,
# encode, compute_update, envelope, sign, submit) was manually verified
# against this live network before being written as a function — see
# docs/BUILD_LOG.md's Phase 9 entry.
fetch_current_config() {
  local output_json="$1"

  local first_org first_msp first_peer_port
  read -r first_org first_msp <<< "$(active_org_lines | head -1)"
  read -r _ first_peer_port <<< "$(org_peer_lines "$first_org" | head -1)"

  local block_path="${output_json}.block.pb"
  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$first_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
    peer channel fetch config "$block_path" \
      -o "localhost:${ORDERER_GENERAL_PORT}" --tls --cafile "$ORDERER_TLS_CA" \
      -c "$CHANNEL_NAME"

  configtxlator proto_decode --input "$block_path" --type common.Block \
    | jq .data.data[0].payload.data.config > "$output_json"
  rm -f "$block_path"
}

# build_new_org_definition writes org_name's channel-config group
# definition to output_json, matching every existing org's exact policy
# shape (Readers OR(admin,peer,client), Writers OR(admin,client),
# Admins OR(admin), Endorsement OR(peer) — confirmed against the
# generated configtx.yaml, not guessed), via `configtxgen -printOrg`
# against a throwaway configtx.yaml pointing at this org's already-
# enrolled MSP (stage 2's bootstrap_org call already produced it). No
# AnchorPeers here — that's set_anchor_peers' own separate update,
# signed by the new org's own admin, which doesn't exist as a channel
# identity until THIS update commits.
build_new_org_definition() {
  local org_name="$1" org_msp="$2" output_json="$3"

  local tmpdir
  tmpdir=$(mktemp -d)
  cat > "${tmpdir}/configtx.yaml" <<EOF
Organizations:
  - &${org_name}
    Name: ${org_name}
    ID: ${org_msp}
    MSPDir: ${CRYPTO_DIR}/organizations/${org_name}/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('${org_msp}.admin', '${org_msp}.peer', '${org_msp}.client')"
      Writers:
        Type: Signature
        Rule: "OR('${org_msp}.admin', '${org_msp}.client')"
      Admins:
        Type: Signature
        Rule: "OR('${org_msp}.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('${org_msp}.peer')"
EOF

  # configtxgen's own INFO logs go to stdout, same class of bug as
  # chaincode.sh's log()-corrupting-a-captured-return-value found in
  # Phase 7 — redirect them to stderr explicitly rather than merge
  # streams, so output_json only ever receives the actual JSON.
  configtxgen -printOrg "$org_name" -configPath "$tmpdir" > "$output_json" 2>/dev/null
  rm -rf "$tmpdir"
}

# submit_config_update computes the delta between original_json and
# modified_json, wraps it in a channel config-update envelope, signs it
# with every "org_name org_msp admin_mspdir peer_port tls_ca" line in
# signer_lines, and submits it using the first signer's identity.
submit_config_update() {
  local original_json="$1" modified_json="$2"
  shift 2
  local signer_lines=("$@")

  local tmpdir
  tmpdir=$(mktemp -d)

  configtxlator proto_encode --input "$original_json" --type common.Config --output "${tmpdir}/original.pb"
  configtxlator proto_encode --input "$modified_json" --type common.Config --output "${tmpdir}/modified.pb"
  configtxlator compute_update --channel_id "$CHANNEL_NAME" \
    --original "${tmpdir}/original.pb" --updated "${tmpdir}/modified.pb" \
    --output "${tmpdir}/update.pb"
  configtxlator proto_decode --input "${tmpdir}/update.pb" --type common.ConfigUpdate > "${tmpdir}/update.json"

  python3 -c "
import json
update = json.load(open('${tmpdir}/update.json'))
envelope = {'payload': {'header': {'channel_header': {'channel_id': '${CHANNEL_NAME}', 'type': 2}}, 'data': {'config_update': update}}}
json.dump(envelope, open('${tmpdir}/envelope.json', 'w'))
"
  configtxlator proto_encode --input "${tmpdir}/envelope.json" --type common.Envelope --output "${tmpdir}/envelope.pb"

  local line org_name org_msp admin_mspdir peer_port tls_ca
  local first_msp="" first_mspdir="" first_peer_port="" first_tls_ca=""
  for line in "${signer_lines[@]}"; do
    read -r org_name org_msp admin_mspdir peer_port tls_ca <<< "$line"
    if [ -z "$first_msp" ]; then
      first_msp="$org_msp"; first_mspdir="$admin_mspdir"; first_peer_port="$peer_port"; first_tls_ca="$tls_ca"
    fi
    log "signing config update as ${org_name} (${org_msp})"
    FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$org_msp" \
    CORE_PEER_MSPCONFIGPATH="$admin_mspdir" \
    CORE_PEER_ADDRESS="localhost:${peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="$tls_ca" \
      peer channel signconfigtx -f "${tmpdir}/envelope.pb"
  done

  log "submitting config update"
  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$first_msp" \
  CORE_PEER_MSPCONFIGPATH="$first_mspdir" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="$first_tls_ca" \
    peer channel update -f "${tmpdir}/envelope.pb" -c "$CHANNEL_NAME" \
      -o "localhost:${ORDERER_GENERAL_PORT}" --tls --cafile "$ORDERER_TLS_CA"

  rm -rf "$tmpdir"
}

# inject_org_into_channel is stage 3: adds org_name's MSP/policy
# definition as a new group under the channel's Application section —
# keyed by ORG NAME, not MSP ID (confirmed against the live channel
# config, not assumed). Signed by the EXISTING active orgs' admins,
# since org_name has no on-channel identity of its own yet to sign
# with — this is exactly why it must come before set_anchor_peers, not
# after.
inject_org_into_channel() {
  local org_name="$1" org_msp="$2"

  local tmpdir
  tmpdir=$(mktemp -d)

  fetch_current_config "${tmpdir}/current.json"
  build_new_org_definition "$org_name" "$org_msp" "${tmpdir}/orgdef.json"

  jq --slurpfile orgdef "${tmpdir}/orgdef.json" \
    ".channel_group.groups.Application.groups[\"${org_name}\"] = \$orgdef[0]" \
    "${tmpdir}/current.json" > "${tmpdir}/modified.json"

  local signer_lines=()
  local existing_org existing_msp existing_peer_port
  while read -r existing_org existing_msp; do
    read -r _ existing_peer_port <<< "$(org_peer_lines "$existing_org" | head -1)"
    signer_lines+=("${existing_org} ${existing_msp} ${CRYPTO_DIR}/organizations/${existing_org}/users/Admin/msp ${existing_peer_port} ${CRYPTO_DIR}/organizations/${existing_org}/peers/peer0/tls/ca.pem")
  done < <(active_org_lines)

  submit_config_update "${tmpdir}/current.json" "${tmpdir}/modified.json" "${signer_lines[@]}"
  rm -rf "$tmpdir"
}

# set_anchor_peers is stage 4: a SEPARATE config-update that only adds
# org_name's AnchorPeers value inside its own (already-existing, as of
# this call) Application group. Signed by org_name's OWN admin — the
# only identity whose signature is even meaningful for a value scoped
# to that org's own group, and only possible now that inject_org_into_
# channel has already committed.
set_anchor_peers() {
  local org_name="$1" org_msp="$2"

  local tmpdir
  tmpdir=$(mktemp -d)
  fetch_current_config "${tmpdir}/current.json"

  local anchor_peers_json
  anchor_peers_json=$(python3 -c "
import json, yaml
dep = yaml.safe_load(open('${LOCAL_YAML}'))
peers = dep['organizations']['${org_name}']['peers']
anchors = [{'host': f'peer{i}.${org_name}', 'port': p['peer_port']} for i, p in enumerate(peers)]
print(json.dumps(anchors))
")

  jq --argjson anchors "$anchor_peers_json" \
    ".channel_group.groups.Application.groups[\"${org_name}\"].values.AnchorPeers = {\"mod_policy\": \"Admins\", \"value\": {\"anchor_peers\": \$anchors}, \"version\": \"0\"}" \
    "${tmpdir}/current.json" > "${tmpdir}/modified.json"

  local first_peer_port
  read -r _ first_peer_port <<< "$(org_peer_lines "$org_name" | head -1)"
  local signer_lines=("${org_name} ${org_msp} ${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp ${first_peer_port} ${CRYPTO_DIR}/organizations/${org_name}/peers/peer0/tls/ca.pem")

  submit_config_update "${tmpdir}/current.json" "${tmpdir}/modified.json" "${signer_lines[@]}"
  rm -rf "$tmpdir"
}
# join_new_org_to_channel is stage 5: joins every peer of org_name using
# GENESIS_BLOCK — the SAME block network.sh's own join_peers uses for
# founding orgs, not the channel's current config block. Confirmed live
# (see docs/ERROR_LOG.md) that Fabric's own ledger-creation code refuses
# any other block number when a peer has no existing ledger for this
# channel: "cannot create ledger from genesis block: expected block
# number=0, received block number=N". A peer's first join to a channel
# always bootstraps from block 0; it then receives and processes every
# later block (including the two config-update blocks that added
# org_name's own MSP/anchor-peers) through normal orderer delivery after
# joining — it does not need those changes already present in the block
# it joins with. Signs as org_name's own Admin identity (enrolled back
# in stage 2) — same per-peer loop shape as network.sh's join_peers,
# just scoped to one org.
#
# Guarded per-peer against re-joining: Fabric rejects it outright
# ("ledger [X] already exists with state [ACTIVE]") — confirmed live
# hitting this exact error on a stage-5 re-run after stage 2 alone was
# made resumable, see docs/ERROR_LOG.md. If this partially fails (peer0
# joins, peer1 doesn't), recovery is simply re-running this stage: the
# peer that already joined is skipped, only the failed one is retried.
join_new_org_to_channel() {
  local org_name="$1" org_msp="$2"

  local peer_name peer_port
  while read -r peer_name peer_port; do
    if FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$org_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls/ca.pem" \
      peer channel getinfo -c "$CHANNEL_NAME" >/dev/null 2>&1; then
      log "${peer_name}.${org_name} has already joined ${CHANNEL_NAME} — skipping"
      continue
    fi

    log "joining ${peer_name}.${org_name} to channel ${CHANNEL_NAME}"
    if FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$org_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls/ca.pem" \
      peer channel join -b "$GENESIS_BLOCK"; then
      :
    else
      # Retry a few times before giving up: wait_for_port only proved
      # the peer's TCP listener was accepting connections, not that its
      # TLS layer had finished initializing — confirmed live (see
      # docs/ERROR_LOG.md) that this can fail outright as "connection
      # reset by peer" on the very first join attempt, since (unlike
      # `peer chaincode invoke`) `peer channel join` has no retry/
      # backoff of its own. Safe to retry freely here: a peer that
      # hasn't successfully joined yet has no "already joined" conflict.
      local join_attempt=2
      local join_succeeded="false"
      while [ "$join_attempt" -le 5 ]; do
        log "join attempt ${join_attempt}/5 for ${peer_name}.${org_name} (previous attempt hit a likely TLS-readiness race), retrying in 2s"
        sleep 2
        if FABRIC_CFG_PATH="$PEERCFG_DIR" \
          CORE_PEER_LOCALMSPID="$org_msp" \
          CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
          CORE_PEER_ADDRESS="localhost:${peer_port}" \
          CORE_PEER_TLS_ENABLED=true \
          CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls/ca.pem" \
            peer channel join -b "$GENESIS_BLOCK"; then
          join_succeeded="true"
          break
        fi
        join_attempt=$((join_attempt + 1))
      done
      if [ "$join_succeeded" != "true" ]; then
        echo "peer channel join failed for ${peer_name}.${org_name} after 5 attempts — this is no longer the known transient race, needs fresh diagnosis" >&2
        exit 1
      fi
    fi
  done < <(org_peer_lines "$org_name")
}

# org_crypto_exists reports (via exit code) whether org_name's org-level
# MSP has already been assembled — the LAST step of bootstrap_org, so
# its presence means stage 2 already completed for this org in a prior
# run. Used to skip stage 2 entirely on a re-run: `fabric-ca-client
# register` is NOT safe to repeat (the CA's registered-identity database
# persists across container restarts, even when the CA container itself
# is recreated) — confirmed live twice now, see docs/ERROR_LOG.md.
# Deliberately does not also verify containers are actually running: if
# someone tore down containers (org-add.sh teardown) without deleting
# crypto, skipping stage 2 here would leave them down — an accepted gap
# for now, matching this project's "fix it when it's a real friction
# point" policy rather than guarding every imaginable mixed state
# up front.
org_crypto_exists() {
  local org_name="$1"
  [ -d "${CRYPTO_DIR}/organizations/${org_name}/msp" ]
}

# is_channel_member reports (via exit code) whether org_name already has
# an Application channel-config group — i.e. whether stages 3-4 already
# ran for it. Queried fresh from the channel's current config, not
# cached: network.yaml's own status field can't answer this question,
# since it only flips pending->member at stage 7, the very last stage —
# it can't distinguish "stages 3-4 done, stage 5 still pending" from
# "nothing done at all."
is_channel_member() {
  local org_name="$1"
  local tmpdir
  tmpdir=$(mktemp -d)
  fetch_current_config "${tmpdir}/current.json"
  local result
  result=$(jq -r --arg org "$org_name" '.channel_group.groups.Application.groups | has($org)' "${tmpdir}/current.json")
  rm -rf "$tmpdir"
  [ "$result" = "true" ]
}

# chaincode_init_required reports (via stdout: "true"/"false") whether
# cc_name's already-committed definition requires an Init invocation —
# queried directly against the channel rather than hardcoded per
# chaincode name, since org-add.sh has no business-logic reason to
# already know this; it only needs to match whatever the ORIGINAL
# commit specified, so approve_for_org's --init-required flag agrees
# with the committed definition instead of guessing.
chaincode_init_required() {
  local cc_name="$1"
  local first_org first_msp first_peer_port
  read -r first_org first_msp <<< "$(active_org_lines | head -1)"
  read -r _ first_peer_port <<< "$(org_peer_lines "$first_org" | head -1)"

  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$first_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
    peer lifecycle chaincode querycommitted \
      --channelID "$CHANNEL_NAME" \
      --name "$cc_name" \
      --output json | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('true' if data.get('init_required') else 'false')
"
}

# install_and_approve_chaincode is stage 6, run once per chaincode:
# packages+installs cc_name for org_name (lib/chaincode.sh's
# package_and_install_for_org — the SAME per-org function chaincode.sh
# itself uses), approves it at the exact version/sequence already used
# on this channel, then starts org_name's own ccaas container for it.
# Deliberately unconditional, not gated on "is this already committed"
# — see this file's own header comment on why a new org's approval can
# be REQUIRED for another chaincode's commit to succeed, not merely
# redundant catch-up, once this org has already joined the Application
# group.
install_and_approve_chaincode() {
  local org_name="$1" org_msp="$2" cc_name="$3"

  CC_NAME="$cc_name"
  CC_LABEL="${CC_NAME}_${CC_VERSION}"
  CCAAS_IMAGE="${CC_NAME}-ccaas:${CC_VERSION}"
  INIT_FUNCTION=""
  if [ "$(chaincode_init_required "$cc_name")" = "true" ]; then
    # Sentinel only, matching lib/chaincode.sh's approve_for_org's own
    # check (`[ -n "$INIT_FUNCTION" ]`) — org-add.sh never invokes Init
    # itself, so the actual function name doesn't matter here, only
    # that this variable is non-empty when the commit already requires
    # it.
    INIT_FUNCTION="required"
  fi

  local package_id
  package_id=$(package_and_install_for_org "$org_name" "$org_msp")
  approve_for_org "$org_name" "$org_msp" "$package_id"
  start_ccaas_container "$org_name" "$package_id"
}

# flip_status_to_member is stage 7 — the ONLY stage that mutates
# network.yaml, run LAST after every prior stage has actually
# succeeded (same "fail loud, don't half-commit" discipline as every
# other stage boundary in this script). Rewrites ONLY org_name's own
# "status: pending" line to "status: member", via a targeted regex on
# the raw file text rather than a full yaml.load/yaml.dump round-trip —
# network.yaml has no comments today, but a full round-trip through
# PyYAML's own dumper could still silently reorder keys or change
# quoting/indentation conventions elsewhere in the file; a scoped text
# substitution changes nothing else, by construction.
flip_status_to_member() {
  local org_name="$1"

  python3 -c "
import re, sys

path = '${NETWORK_YAML}'
with open(path) as f:
    content = f.read()

pattern = re.compile(r'(- name: ${org_name}\n(?:.*\n)*?\s*status: )pending\b')
new_content, count = pattern.subn(r'\1member', content)
if count != 1:
    print(f'expected exactly one status:pending replacement for ${org_name}, got {count}', file=sys.stderr)
    sys.exit(1)

with open(path, 'w') as f:
    f.write(new_content)
"
  log "${org_name}'s status in ${NETWORK_YAML} flipped from pending to member"
}

cmd_add() {
  ORG_NAME="${1:-}"
  if [ -z "$ORG_NAME" ]; then
    echo "usage: $0 <org-name>" >&2
    exit 1
  fi

  ORG_MSP=$(python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
for org in net['organizations']:
    if org['name'] == '${ORG_NAME}':
        print(org['msp'])
        break
")
  if [ -z "$ORG_MSP" ]; then
    echo "error: no organization named '${ORG_NAME}' in ${NETWORK_YAML}" >&2
    exit 1
  fi

  ORG_STATUS=$(python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
for org in net['organizations']:
    if org['name'] == '${ORG_NAME}':
        print(org['status'])
        break
")
  if [ "$ORG_STATUS" != "pending" ]; then
    echo "error: ${ORG_NAME}'s status in ${NETWORK_YAML} is '${ORG_STATUS}', not 'pending' — nothing to add" >&2
    exit 1
  fi

  trap on_add_error ERR

  stage 1 "confirming ${ORG_NAME} (${ORG_MSP}) already passed its governance vote"
  require_active_institution "$ORG_MSP"

  stage 2 "enrolling crypto and starting containers for ${ORG_NAME}"
  if org_crypto_exists "$ORG_NAME"; then
    log "${ORG_NAME}'s crypto material already exists — skipping enrollment, assuming containers are already up from a prior run"
  else
    bring_up_org_containers "$ORG_NAME" "$ORG_MSP"
  fi

   if is_channel_member "$ORG_NAME"; then
    log "${ORG_NAME} is already a channel member — skipping stages 3-4 (MSP injection, anchor peers)"
  else
    stage 3 "injecting ${ORG_NAME}'s MSP definition into the channel, signed by existing orgs"
    inject_org_into_channel "$ORG_NAME" "$ORG_MSP"

    stage 4 "setting ${ORG_NAME}'s anchor peers, signed by its own admin"
    set_anchor_peers "$ORG_NAME" "$ORG_MSP"
  fi

  stage 5 "joining ${ORG_NAME}'s peers to the channel using its current config block"
  join_new_org_to_channel "$ORG_NAME" "$ORG_MSP"

  stage 6 "installing and approving institution-cc and certificate-cc for ${ORG_NAME}"
  install_and_approve_chaincode "$ORG_NAME" "$ORG_MSP" "institution-cc"
  install_and_approve_chaincode "$ORG_NAME" "$ORG_MSP" "certificate-cc"

  stage 7 "flipping ${ORG_NAME}'s status from pending to member"
  flip_status_to_member "$ORG_NAME"

  trap - ERR
  log "${ORG_NAME} has been fully onboarded — now a member of the BLC-31 consortium"
}

# cmd_teardown removes every non-founding org's CA/peer/CouchDB
# containers. These are started via plain `docker run`, never
# docker-compose — ARCHITECTURE.md forbids org-add.sh from touching
# `blcgen generate`, so an added org's containers can never be added to
# the generated compose file, even after its status flips to "member".
# Founding orgs are always compose-managed and excluded here — docker
# compose down already handles them correctly. Must run BEFORE docker
# compose down, same dependency-order reasoning as chaincode.sh's own
# teardown (see docs/ERROR_LOG.md's Phase 7 repeatability-check entry) —
# found the identical gap live while wiping the network to test this
# script's own stages 3-4 cleanly, see docs/BUILD_LOG.md's Phase 9 entry.
cmd_teardown() {
  local org_names
  mapfile -t org_names < <(python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
for org in net['organizations']:
    if org['status'] != 'founding':
        print(org['name'])
")

  local org_name
  for org_name in "${org_names[@]}"; do
    [ -z "$org_name" ] && continue

    if docker rm -f "ca.${org_name}" >/dev/null 2>&1; then
      log "removed ca.${org_name}"
    fi

    local peer_lines
    mapfile -t peer_lines < <(org_peer_lines "$org_name" 2>/dev/null) || true
    local peer_line peer_name peer_port
    for peer_line in "${peer_lines[@]}"; do
      [ -z "$peer_line" ] && continue
      read -r peer_name peer_port <<< "$peer_line"
      if docker rm -f "${peer_name}.${org_name}" >/dev/null 2>&1; then
        log "removed ${peer_name}.${org_name}"
      fi
      if docker rm -f "couchdb.${peer_name}.${org_name}" >/dev/null 2>&1; then
        log "removed couchdb.${peer_name}.${org_name}"
      fi
    done
  done
}

case "${1:-}" in
  teardown)
    cmd_teardown
    ;;
  "")
    echo "usage: $0 <org-name>|teardown" >&2
    exit 1
    ;;
  *)
    cmd_add "$@"
    ;;
esac
