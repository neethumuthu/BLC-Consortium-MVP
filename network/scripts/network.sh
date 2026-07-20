#!/usr/bin/env bash

# network.sh — orchestrates the full BLC-31 network lifecycle.
#
# Usage:
#   ./network.sh up             bootstrap and start the network from scratch
#   ./network.sh down           stop all containers (keeps crypto/generated/channel state)
#   ./network.sh down --wipe    stop + remove volumes, crypto/, generated/, channel-artifacts/
#   ./network.sh status         show container and channel-membership status
#
# `up` is intended for a clean/fresh state, not idempotent re-runs.
# Stages 3 (crypto enrollment), 8 (orderer channel join), and 9 (peer
# channel join) are NOT safely re-runnable after a partial failure —
# Fabric CA rejects re-registering an already-registered identity, and
# Fabric rejects re-joining an already-joined channel. A failure at
# those stages requires `down --wipe` before retrying `up`. This is a
# deliberate MVP scope decision, not an oversight: build real
# idempotency (skip-if-already-done checks) later if it becomes a real
# friction point, not preemptively. See docs/BUILD_LOG.md's Phase 6
# entry for the full per-stage failure analysis this was decided from.

cd "$(dirname "${BASH_SOURCE[0]}")/.."
source "scripts/lib/common.sh"

CHANNEL_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['channel']['name'])")
ORDERER_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['orderer']['name'])")

# --- stage tracking, for a clear "FAILED at stage N" message instead of
# letting a raw command error bubble up with no context on whether a
# wipe is needed before retrying. ---

CURRENT_STAGE=0
CURRENT_STAGE_NAME=""
CURRENT_STAGE_NEEDS_WIPE="no"

stage() {
  CURRENT_STAGE="$1"
  CURRENT_STAGE_NAME="$2"
  CURRENT_STAGE_NEEDS_WIPE="$3"   # "yes" or "no"
  log "stage ${CURRENT_STAGE}/10: ${CURRENT_STAGE_NAME}"
}

on_up_error() {
  local exit_code=$?
  echo "[network] command failed: ${BASH_COMMAND} (exit ${exit_code})" >&2
  if [ "$CURRENT_STAGE_NEEDS_WIPE" = "yes" ]; then
    echo "[network] FAILED at stage ${CURRENT_STAGE}: ${CURRENT_STAGE_NAME} — run './scripts/network.sh down --wipe' before retrying 'up'" >&2
  else
    echo "[network] FAILED at stage ${CURRENT_STAGE}: ${CURRENT_STAGE_NAME} — safe to re-run './scripts/network.sh up' directly, no wipe needed" >&2
  fi
  exit "$exit_code"
}

# wait_for_port now lives in lib/common.sh — shared with org-add.sh
# (Phase 9), which needs the identical readiness check for a newly
# added org's own peers.

wait_for_all_nodes() {
  local ports
  ports=$(python3 -c "
import yaml
dep = yaml.safe_load(open('${LOCAL_YAML}'))
net = yaml.safe_load(open('${NETWORK_YAML}'))
ports = [n['general_port'] for n in dep['orderer']['nodes']]
for org in net['organizations']:
    if org['status'] in ('founding', 'member'):
        for p in dep['organizations'][org['name']]['peers']:
            ports.append(p['peer_port'])
print(' '.join(str(p) for p in ports))
")
  for port in $ports; do
    log "waiting for port ${port}"
    wait_for_port "$port"
  done
}

# create_channel joins every orderer node to the channel via osnadmin's
# Channel Participation API, using the orderer org Admin's TLS identity
# (mutual TLS is required on this endpoint — see bootstrap-crypto.sh).
create_channel() {
  local admin_tls_dir="${CRYPTO_DIR}/organizations/${ORDERER_NAME}/users/Admin/tls"

  # mapfile + process substitution (not a pipe) so this loop runs in the
  # current shell, not a subshell — a pipe's right-hand side runs in a
  # subshell, and a failure there wouldn't reliably reach cmd_up's ERR
  # trap. Found the hard way: see docs/ERROR_LOG.md.
  local lines
  mapfile -t lines < <(python3 -c "
import yaml
dep = yaml.safe_load(open('${LOCAL_YAML}'))
for i, n in enumerate(dep['orderer']['nodes']):
    print(f\"orderer{i} {n['admin_port']}\")
")

  local line node_name admin_port orderer_tls_ca
  for line in "${lines[@]}"; do
    read -r node_name admin_port <<< "$line"
    orderer_tls_ca="${CRYPTO_DIR}/organizations/${ORDERER_NAME}/orderers/${node_name}/tls/ca.pem"
    log "joining channel ${CHANNEL_NAME} on ${node_name} (admin port ${admin_port})"
    FABRIC_CFG_PATH="$PEERCFG_DIR" osnadmin channel join \
      --channelID "$CHANNEL_NAME" \
      --config-block "$GENESIS_BLOCK" \
      -o "localhost:${admin_port}" \
      --ca-file "$orderer_tls_ca" \
      --client-cert "${admin_tls_dir}/signcerts/cert.pem" \
      --client-key "${admin_tls_dir}/key.pem"
  done
}

# join_peers joins every founding/member org's peers to the channel,
# signing as that org's Admin identity (regular MSP, no TLS client cert
# needed — CORE_PEER_TLS_CLIENTAUTHREQUIRED was never set, so this only
# needs one-way TLS trust of the peer's own server certificate).
join_peers() {
  local lines
  mapfile -t lines < <(python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
dep = yaml.safe_load(open('${LOCAL_YAML}'))
for org in net['organizations']:
    if org['status'] in ('founding', 'member'):
        dep_org = dep['organizations'][org['name']]
        for i, p in enumerate(dep_org['peers']):
            print(f\"{org['name']} {org['msp']} peer{i} {p['peer_port']}\")
")

  local line org_name org_msp peer_name peer_port
  for line in "${lines[@]}"; do
    read -r org_name org_msp peer_name peer_port <<< "$line"
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
      # wait_for_port only confirms the peer's TCP listener accepts
      # connections, not that its TLS layer has finished initializing —
      # confirmed live (2026-07-15) hitting "connection reset by peer" on
      # the very first join attempt twice in a row, identical to the same
      # race org-add.sh's join_new_org_to_channel already retries around.
      # peer channel join has no retry/backoff of its own, so retry here.
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
  done
}

# verify_channel_membership confirms every peer of every founding/member
# org actually joined and processed the genesis block (block height >= 1)
# — not just each org's peer0. With 2 peers/org, checking only peer0
# would never actually confirm peer1 joined at all, and more importantly
# wouldn't confirm the Phase 5 gossip-bootstrap fix
# (CORE_PEER_GOSSIP_BOOTSTRAP) is doing its job: peer1 only learns about
# the channel by gossiping with peer0 within its own org, since it isn't
# an anchor peer and never talks to the orderer directly for this. Anchor
# peers themselves are already set — baked into the genesis block back in
# Phase 4 (configtx.yaml.tmpl's AnchorPeers) — so there's no separate
# mutation needed here for founding/member orgs; this just confirms the
# result. Org-add.sh (Phase 9) is where a *newly* joining org's anchor
# peer actually gets set, since that org was never in the genesis block.
verify_channel_membership() {
  local lines
  mapfile -t lines < <(python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
dep = yaml.safe_load(open('${LOCAL_YAML}'))
for org in net['organizations']:
    if org['status'] in ('founding', 'member'):
        dep_org = dep['organizations'][org['name']]
        for i, p in enumerate(dep_org['peers']):
            print(f\"{org['name']} {org['msp']} peer{i} {p['peer_port']}\")
")

  local line org_name org_msp peer_name peer_port
  for line in "${lines[@]}"; do
    read -r org_name org_msp peer_name peer_port <<< "$line"
    log "checking channel membership for ${peer_name}.${org_name}"
    FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$org_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls/ca.pem" \
      peer channel getinfo -c "$CHANNEL_NAME"
  done
}

cmd_up() {
  trap on_up_error ERR

  stage 1 "validating config" no
  go run ./cmd/blcgen validate

  stage 2 "generating compose files" no
  go run ./cmd/blcgen generate compose

  stage 3 "bootstrapping crypto material (starts CAs, enrolls identities)" yes
  ./scripts/bootstrap-crypto.sh

  stage 4 "generating configtx.yaml" no
  go run ./cmd/blcgen generate configtx

  stage 5 "building genesis block" no
  mkdir -p "$CHANNEL_ARTIFACTS_DIR"
  rm -f "$GENESIS_BLOCK"
  FABRIC_CFG_PATH="$(pwd)/${GENERATED_DIR}" configtxgen \
    -profile BLCChannel -channelID "$CHANNEL_NAME" -outputBlock "$GENESIS_BLOCK"

  stage 6 "starting orderer/peer/CouchDB containers" no
  require_file "$NET_COMPOSE_FILE" "run 'blcgen generate compose' first"
  docker compose -f "$NET_COMPOSE_FILE" up -d
  wait_for_all_nodes

  stage 7 "generating connection profiles" no
  go run ./cmd/blcgen generate profiles

  stage 8 "creating channel (joining orderer nodes)" yes
  create_channel

  stage 9 "joining peers to channel" yes
  join_peers

  stage 10 "verifying channel membership" no
  verify_channel_membership

  trap - ERR
  log "network is up — channel '${CHANNEL_NAME}' created and joined by all founding/member orgs"
}

cmd_down() {
  log "stopping orderer/peer/CouchDB containers"
  [ -f "$NET_COMPOSE_FILE" ] && docker compose -f "$NET_COMPOSE_FILE" down

  log "stopping CA containers"
  [ -f "$CA_COMPOSE_FILE" ] && docker compose -f "$CA_COMPOSE_FILE" down

  return 0
}

cmd_wipe() {
  # chaincode-as-a-service containers attach to the `blc` network via a
  # plain `docker run --network blc` (see chaincode.sh) — invisible to
  # docker compose, so they must detach BEFORE compose's own `down`
  # tries to remove that network, or removal silently no-ops ("still in
  # use") and the network survives the wipe. Order matters here, not
  # just presence. See docs/BUILD_LOG.md's Phase 7 repeatability-check
  # entry.
  log "tearing down chaincode-as-a-service containers"
  ./scripts/chaincode.sh teardown

  # Same dependency-order reasoning as the chaincode teardown above:
  # org-add.sh's own CA/peer/CouchDB containers (for any org onboarded
  # at runtime) are started via plain `docker run`, never
  # docker-compose, so they must detach from `blc` before compose's own
  # `down` tries to remove the network. Found the identical gap live —
  # see docs/ERROR_LOG.md's Phase 9 entry.
  log "tearing down org-add.sh's own org containers"
  ./scripts/org-add.sh teardown

  log "stopping and removing containers + volumes"
  [ -f "$NET_COMPOSE_FILE" ] && docker compose -f "$NET_COMPOSE_FILE" down -v
  [ -f "$CA_COMPOSE_FILE" ] && docker compose -f "$CA_COMPOSE_FILE" down -v

  # CA containers write crypto material as root inside the container,
  # so a bind-mounted host directory ends up root-owned too — a plain
  # `rm -rf` as the invoking user fails with Permission denied. Delete
  # via a throwaway container instead (same fix as docs/ERROR_LOG.md's
  # 2026-07-06 "rm -rf crypto/ca-servers failed" entry), not sudo.
  if [ -d "$CRYPTO_DIR" ]; then
    log "removing crypto material (via throwaway container — it's root-owned)"
    docker run --rm -v "${CRYPTO_DIR}:/crypto" hyperledger/fabric-ca:1.5 sh -c "rm -rf /crypto/*"
  fi

  log "removing generated artifacts and channel state"
  rm -rf "$GENERATED_DIR" "$CHANNEL_ARTIFACTS_DIR"

  log "wipe complete"
}

cmd_status() {
  echo "=== CA containers ==="
  if [ -f "$CA_COMPOSE_FILE" ]; then
    docker compose -f "$CA_COMPOSE_FILE" ps
  else
    echo "(${CA_COMPOSE_FILE} not found — network never generated)"
  fi

  echo
  echo "=== Orderer / Peer / CouchDB containers ==="
  if [ -f "$NET_COMPOSE_FILE" ]; then
    docker compose -f "$NET_COMPOSE_FILE" ps
  else
    echo "(${NET_COMPOSE_FILE} not found — network never generated)"
  fi

  echo
  echo "=== Channel membership ==="
  if [ -f "$GENESIS_BLOCK" ]; then
    verify_channel_membership
  else
    echo "(${GENESIS_BLOCK} not found — channel never created)"
  fi
}

case "${1:-}" in
  up)
    cmd_up
    ;;
  down)
    if [ "${2:-}" = "--wipe" ]; then
      cmd_wipe
    else
      cmd_down
    fi
    ;;
  status)
    cmd_status
    ;;
  *)
    echo "usage: $0 <up|down [--wipe]|status>" >&2
    exit 1
    ;;
esac
