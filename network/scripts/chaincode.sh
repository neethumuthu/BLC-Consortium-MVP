#!/usr/bin/env bash

# chaincode.sh — packages, installs, approves, commits, and (optionally)
# initializes a chaincode on the running network's channel, running it
# as chaincode-as-a-service (ccaas) — not via the peer's own internal
# "classic" golang builder. See docs/BUILD_LOG.md's Phase 7 entry for
# why: Fabric 2.5.0's bundled Docker client (used by the peer's classic
# builder) is incompatible with this host's newer Docker Engine version,
# which dropped legacy Build API support the old client depends on.
# Building the chaincode's own Docker image via a plain host-side
# `docker build` sidesteps that broken path entirely.
#
# Deliberately generic — takes the chaincode name as a parameter and
# knows nothing chaincode-specific — so the same script deploys
# institution-cc today and certificate-cc in Phase 8 without a
# special-cased branch. Whether a chaincode needs an Init transaction is
# the CALLER's decision, passed in via --init-function/--init-args.
#
# Usage:
#   ./chaincode.sh deploy <name> [--init-function <fn> --init-args <arg>...]
#   ./chaincode.sh teardown
#
# teardown stops/removes every ccaas container this script could have
# started — one per (chaincode, founding/member org) pair — so callers
# (network.sh's `down --wipe`, see below) don't need their own state
# file to know what's running. It discovers both dimensions rather than
# hardcoding either: chaincode names from chaincode/*'s own directory
# listing, orgs from network.yaml via active_org_lines, same as every
# other loop in this script. Must run BEFORE `docker compose down` tears
# down the `blc` network — these containers are started with a plain
# `docker run --network blc`, invisible to docker compose, so compose
# down's own network removal silently no-ops ("still in use") if they're
# still attached. See docs/BUILD_LOG.md's Phase 7 repeatability-check
# entry for how this was found.
#
# Requires chaincode/<name>/Dockerfile to build a container that runs the
# chaincode as a shim.ChaincodeServer, reading CHAINCODE_ID and
# CHAINCODE_SERVER_ADDRESS from the environment (this script sets both).
#
# Each --init-args value becomes exactly one element of the invoke's
# Args array — contractapi maps ONE Args string to ONE Go parameter, by
# position. For a plain string parameter, pass it as-is. For a slice
# parameter (e.g. InitLedger(foundingMSPIDs []string)), contractapi
# expects that ONE Args string to itself be a JSON-encoded array — so
# pass ONE already-JSON-encoded, quoted argument, not multiple bare
# values (which would word-split into multiple Args elements and fail
# with "Conversion error... was not passed in expected format []string"
# — hit exactly this once deploying institution-cc, see
# docs/BUILD_LOG.md's Phase 7 ccaas entry):
#
#   FOUNDING_MSPS_JSON=$(python3 -c "
#     import json, yaml
#     net = yaml.safe_load(open('config/network.yaml'))
#     print(json.dumps([o['msp'] for o in net['organizations'] if o['status'] == 'founding']))
#   ")
#   ./scripts/chaincode.sh deploy institution-cc \
#     --init-function InitLedger --init-args "$FOUNDING_MSPS_JSON"
#
# One ccaas container PER ORG, not one shared container and not one per
# peer: both of an org's peers share their own org's chaincode service
# instance, matching this project's per-org trust boundary. This means
# packaging (and therefore the package ID) is done ONCE PER ORG, not
# once globally — each org's connection.json points at a different
# address, so each org's package differs and gets its own package ID.
# Fabric's lifecycle model explicitly allows approving orgs to use
# different package IDs for the same chaincode definition (name/version/
# sequence) — only those three need to match across orgs, not the
# package ID itself.
#
# Sequence/version scope: this script only ever commits at sequence 1,
# version 1.0 — a first-ever commit. Upgrade support is out of scope for
# this pass; build it later against a real need, not now.
#
# Retry safety: cmd_deploy checks whether the definition is already
# committed at this exact sequence/version BEFORE packaging/installing/
# approving anything, and skips straight to (re-)starting containers and
# init if so. This is not just a nicety — re-running the full deploy
# after a definition is already committed is actively harmful, not
# merely redundant: it installs and approves a NEW package under the
# SAME already-committed sequence, which checkcommitreadiness correctly
# refuses, but by then the peer's own chaincode launcher has two
# installed packages associated with one chaincode name and gets
# confused about which to launch, timing out or erroring with "duplicate
# chaincodeID" on subsequent invokes — found the hard way, see
# docs/ERROR_LOG.md's entry on this exact incident. Recovering from that
# confused state isn't something this script attempts; the fix is
# preventing it, by detecting "already committed" and never re-running
# package/install/approve/commit in that case, regardless of which later
# stage is what actually failed.

cd "$(dirname "${BASH_SOURCE[0]}")/.."
source "scripts/lib/common.sh"
# active_org_lines/org_peer_lines live in lib/orgs.sh — shared with
# org-add.sh (Phase 9), which needs the same founding/member enumeration
# to query an existing org and to collect admin signatures.
source "scripts/lib/orgs.sh"

CHANNEL_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['channel']['name'])")
ORDERER_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['orderer']['name'])")
ORDERER_GENERAL_PORT=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['orderer']['nodes'][0]['general_port'])")
ORDERER_TLS_CA="${CRYPTO_DIR}/organizations/${ORDERER_NAME}/orderers/orderer0/tls/ca.pem"

CC_VERSION="1.0"
CC_SEQUENCE="1"
CCAAS_PORT="9999"

CURRENT_STAGE=0
CURRENT_STAGE_NAME=""

stage() {
  CURRENT_STAGE="$1"
  CURRENT_STAGE_NAME="$2"
  log "stage ${CURRENT_STAGE}/6: ${CURRENT_STAGE_NAME}"
}

on_deploy_error() {
  local exit_code=$?
  echo "[chaincode] command failed: ${BASH_COMMAND} (exit ${exit_code})" >&2
  echo "[chaincode] FAILED at stage ${CURRENT_STAGE}: ${CURRENT_STAGE_NAME} — safe to re-run './scripts/chaincode.sh deploy ${CC_NAME}...' directly, no wipe needed" >&2
  exit "$exit_code"
}

build_ccaas_image() {
  log "building ${CCAAS_IMAGE} from ${CHAINCODE_ROOT_DIR}/${CC_NAME}/Dockerfile"
  docker build -f "${CHAINCODE_ROOT_DIR}/${CC_NAME}/Dockerfile" -t "$CCAAS_IMAGE" "${CHAINCODE_ROOT_DIR}/${CC_NAME}"
}

# package_and_install_for_org builds this org's own connection.json
# (pointing at its own future ccaas container), hand-tars it into a
# lifecycle package exactly matching Fabric's own reference ccaas sample
# (fabric-samples/test-network/scripts/deployCCAAS.sh) rather than
# `peer lifecycle chaincode package --lang ...`, which has no registered
# platform for "ccaas"/"external" and would reject an unrecognized
# language. Computes the package ID locally via `calculatepackageid` —
# no install needed first, avoiding any restart-after-install step later
# — then installs on every one of this org's peers. Echoes the package
# ID as this function's only stdout output, for the caller to capture.
package_and_install_for_org() {
  local org_name="$1" org_msp="$2"
  local address="${CC_NAME}.${org_name}:${CCAAS_PORT}"

  local tmpdir
  tmpdir=$(mktemp -d)
  mkdir -p "${tmpdir}/src" "${tmpdir}/pkg"

  cat > "${tmpdir}/src/connection.json" <<EOF
{
  "address": "${address}",
  "dial_timeout": "10s",
  "tls_required": false
}
EOF

  cat > "${tmpdir}/pkg/metadata.json" <<EOF
{
  "type": "ccaas",
  "label": "${CC_LABEL}"
}
EOF

  tar -C "${tmpdir}/src" -czf "${tmpdir}/pkg/code.tar.gz" .
  local package_file="${GENERATED_DIR}/${CC_NAME}-${org_name}.tar.gz"
  tar -C "${tmpdir}/pkg" -czf "$package_file" metadata.json code.tar.gz
  rm -rf "$tmpdir"

  local package_id
  package_id=$(FABRIC_CFG_PATH="$PEERCFG_DIR" peer lifecycle chaincode calculatepackageid "$package_file")
  # >&2 is deliberate here, not cosmetic: this function's stdout is the
  # caller's return channel for package_id (captured via $(...)) — any
  # log() call left on stdout would corrupt that captured value with
  # interleaved progress text. Found the hard way: see docs/BUILD_LOG.md's
  # Phase 7 ccaas entry for the exact garbled output this produced and
  # how it silently broke the approval step three stages later.
  log "${org_name}'s package ID: ${package_id}" >&2

  local lines
  mapfile -t lines < <(org_peer_lines "$org_name")
  local line peer_name peer_port
  for line in "${lines[@]}"; do
    read -r peer_name peer_port <<< "$line"
    log "installing ${CC_NAME} (${org_name}'s package) on ${peer_name}.${org_name}" >&2
    FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$org_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/${peer_name}/tls/ca.pem" \
      peer lifecycle chaincode install "$package_file" >&2
  done

  echo "$package_id"
}

approve_for_org() {
  local org_name="$1" org_msp="$2" package_id="$3"
  local first_peer_port
  read -r _ first_peer_port <<< "$(org_peer_lines "$org_name" | head -1)"

  local init_flag=()
  [ -n "$INIT_FUNCTION" ] && init_flag=(--init-required)

  log "approving ${CC_NAME} for ${org_name} (package ID ${package_id})"
  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$org_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/peer0/tls/ca.pem" \
    peer lifecycle chaincode approveformyorg \
      --channelID "$CHANNEL_NAME" \
      --name "$CC_NAME" \
      --version "$CC_VERSION" \
      --package-id "$package_id" \
      --sequence "$CC_SEQUENCE" \
      "${init_flag[@]}" \
      -o "localhost:${ORDERER_GENERAL_PORT}" \
      --tls --cafile "$ORDERER_TLS_CA"
}

check_commit_readiness() {
  local first_org first_msp first_peer_port
  read -r first_org first_msp <<< "$(active_org_lines | head -1)"
  read -r _ first_peer_port <<< "$(org_peer_lines "$first_org" | head -1)"

  local init_flag=()
  [ -n "$INIT_FUNCTION" ] && init_flag=(--init-required)

  local readiness_json
  readiness_json=$(FABRIC_CFG_PATH="$PEERCFG_DIR" \
    CORE_PEER_LOCALMSPID="$first_msp" \
    CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
    CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
      peer lifecycle chaincode checkcommitreadiness \
        --channelID "$CHANNEL_NAME" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --sequence "$CC_SEQUENCE" \
        "${init_flag[@]}" \
        -o "localhost:${ORDERER_GENERAL_PORT}" \
        --tls --cafile "$ORDERER_TLS_CA" \
        --output json)

  echo "$readiness_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
approvals = data.get('approvals', {})
missing = [org for org, approved in approvals.items() if not approved]
if missing:
    print('error: not enough approvals yet, missing: ' + ', '.join(missing), file=sys.stderr)
    sys.exit(1)
print('all required orgs have approved: ' + ', '.join(approvals.keys()))
"
}

# already_committed reports (via exit code) whether CC_NAME is already
# committed on the channel at exactly CC_VERSION/CC_SEQUENCE. Queried
# against the first active org's own peer — querycommitted is a
# channel-wide fact, not a per-org one, so any org's peer gives the same
# answer. A chaincode never deployed before simply fails this query
# (caught by the try/except below), correctly treated as "not
# committed" rather than an error.
already_committed() {
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
      --name "$CC_NAME" \
      --output json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if str(data.get('version')) == '$CC_VERSION' and str(data.get('sequence')) == '$CC_SEQUENCE' else 1)
"
}

# installed_package_id_for_org recovers an already-installed package's
# ID by matching CC_LABEL, for the case where already_committed is true
# and package_and_install_for_org was therefore never called this run —
# start_ccaas_container still needs a package ID to set CHAINCODE_ID.
installed_package_id_for_org() {
  local org_name="$1" org_msp="$2"
  local first_peer_port
  read -r _ first_peer_port <<< "$(org_peer_lines "$org_name" | head -1)"

  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$org_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${org_name}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${org_name}/peers/peer0/tls/ca.pem" \
    peer lifecycle chaincode queryinstalled --output json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for pkg in data.get('installed_chaincodes', []):
    if pkg.get('label') == '${CC_LABEL}':
        print(pkg['package_id'])
        break
"
}

commit_definition() {
  local lines
  mapfile -t lines < <(active_org_lines)

  local peer_addr_flags=()
  local first_org="" first_msp="" first_peer_port=""
  local line org_name org_msp peer_port
  for line in "${lines[@]}"; do
    read -r org_name org_msp <<< "$line"
    read -r _ peer_port <<< "$(org_peer_lines "$org_name" | head -1)"
    if [ -z "$first_org" ]; then
      first_org="$org_name"; first_msp="$org_msp"; first_peer_port="$peer_port"
    fi
    peer_addr_flags+=(--peerAddresses "localhost:${peer_port}" --tlsRootCertFiles "${CRYPTO_DIR}/organizations/${org_name}/peers/peer0/tls/ca.pem")
  done

  local init_flag=()
  [ -n "$INIT_FUNCTION" ] && init_flag=(--init-required)

  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$first_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
    peer lifecycle chaincode commit \
      --channelID "$CHANNEL_NAME" \
      --name "$CC_NAME" \
      --version "$CC_VERSION" \
      --sequence "$CC_SEQUENCE" \
      "${init_flag[@]}" \
      -o "localhost:${ORDERER_GENERAL_PORT}" \
      --tls --cafile "$ORDERER_TLS_CA" \
      "${peer_addr_flags[@]}"
}

# wait_for_ccaas_ready polls the container's actual gRPC listening port
# from the host, via its Docker-assigned IP on the blc network — ccaas
# containers never publish CCAAS_PORT to the host (unlike node ports, so
# network.sh's own wait_for_port can't be reused as-is), so this checks
# reachability through the bridge network's host-side interface instead.
# Confirms the chaincode server process is actually accepting
# connections, not just that `docker run` returned — `docker run -d`
# only means the container process started, not that its internal gRPC
# server has finished initializing. This exact gap is why
# institution-cc's first live init-invoke failed with a container
# DNS/connection error even though `docker run` itself succeeded — see
# docs/ERROR_LOG.md.
#
# Deliberately spawns a real subprocess (`timeout ... bash -c "exec
# 3<>..."`), not a bare `(exec 3<>...)` subshell — confirmed the bare
# form corrupts this script's own fd 2 (stderr) for the rest of its
# life once the connection succeeds, silently swallowing every later
# `>&2` write, including on_deploy_error's own "FAILED at stage N"
# message. A forced subprocess boundary doesn't leak that way. See
# docs/ERROR_LOG.md's 2026-07-10 entry.
wait_for_ccaas_ready() {
  local container_name="$1"
  local tries=30
  local ip=""
  while [ -z "$ip" ]; do
    ip=$(docker inspect -f '{{(index .NetworkSettings.Networks "blc").IPAddress}}' "$container_name" 2>/dev/null)
    if [ -z "$ip" ]; then
      tries=$((tries - 1))
      if [ "$tries" -le 0 ]; then
        echo "${container_name} never got an IP on the blc network" >&2
        exit 1
      fi
      sleep 1
    fi
  done

  tries=30
  until timeout 1 bash -c "exec 3<>/dev/tcp/${ip}/${CCAAS_PORT}" 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "${container_name} did not become ready on port ${CCAAS_PORT} in time" >&2
      exit 1
    fi
    sleep 1
  done
}

# start_ccaas_container (re)starts this org's chaincode-as-a-service
# container with the CHAINCODE_ID it registered at install time. Removes
# any existing container of the same name first, so this is safe to
# re-run (e.g. after a failed later stage) without manual cleanup. Waits
# for the container to actually be reachable before returning — the
# caller (invoke_init) needs it ready immediately, not just started.
start_ccaas_container() {
  local org_name="$1" package_id="$2"
  local container_name="${CC_NAME}.${org_name}"

  docker rm -f "$container_name" >/dev/null 2>&1 || true

  log "starting ${container_name} (CHAINCODE_ID=${package_id})"
  docker run --rm -d \
    --name "$container_name" \
    --network blc \
    -e CHAINCODE_ID="$package_id" \
    -e CHAINCODE_SERVER_ADDRESS="0.0.0.0:${CCAAS_PORT}" \
    "$CCAAS_IMAGE" >/dev/null

  log "waiting for ${container_name} to become ready"
  wait_for_ccaas_ready "$container_name"
}

invoke_init() {
  local lines
  mapfile -t lines < <(active_org_lines)

  local peer_addr_flags=()
  local first_org="" first_msp="" first_peer_port=""
  local line org_name org_msp peer_port
  for line in "${lines[@]}"; do
    read -r org_name org_msp <<< "$line"
    read -r _ peer_port <<< "$(org_peer_lines "$org_name" | head -1)"
    if [ -z "$first_org" ]; then
      first_org="$org_name"; first_msp="$org_msp"; first_peer_port="$peer_port"
    fi
    peer_addr_flags+=(--peerAddresses "localhost:${peer_port}" --tlsRootCertFiles "${CRYPTO_DIR}/organizations/${org_name}/peers/peer0/tls/ca.pem")
  done

  local args_json
  args_json=$(python3 -c "
import json, sys
print(json.dumps(sys.argv[1:]))
" "${INIT_ARGS[@]}")

  FABRIC_CFG_PATH="$PEERCFG_DIR" \
  CORE_PEER_LOCALMSPID="$first_msp" \
  CORE_PEER_MSPCONFIGPATH="${CRYPTO_DIR}/organizations/${first_org}/users/Admin/msp" \
  CORE_PEER_ADDRESS="localhost:${first_peer_port}" \
  CORE_PEER_TLS_ENABLED=true \
  CORE_PEER_TLS_ROOTCERT_FILE="${CRYPTO_DIR}/organizations/${first_org}/peers/peer0/tls/ca.pem" \
    peer chaincode invoke \
      --isInit \
      -o "localhost:${ORDERER_GENERAL_PORT}" \
      --tls --cafile "$ORDERER_TLS_CA" \
      -C "$CHANNEL_NAME" \
      -n "$CC_NAME" \
      -c "{\"function\":\"${INIT_FUNCTION}\",\"Args\":${args_json}}" \
      "${peer_addr_flags[@]}"
}

# discover_chaincode_names lists every chaincode directory under
# chaincode/ — teardown's other half of "don't hardcode the name":
# whatever chaincodes exist on disk are the ones that might have a
# ccaas container running, regardless of which ones were actually
# deployed in this session.
discover_chaincode_names() {
  find "$CHAINCODE_ROOT_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;
}

cmd_teardown() {
  local org_lines
  mapfile -t org_lines < <(active_org_lines)

  local cc_name
  while IFS= read -r cc_name; do
    [ -z "$cc_name" ] && continue
    local line org_name org_msp container_name
    for line in "${org_lines[@]}"; do
      read -r org_name org_msp <<< "$line"
      container_name="${cc_name}.${org_name}"
      if docker rm -f "$container_name" >/dev/null 2>&1; then
        log "removed ${container_name}"
      fi
    done
  done < <(discover_chaincode_names)
}

cmd_deploy() {
  CC_NAME="${1:-}"
  if [ -z "$CC_NAME" ]; then
    echo "usage: $0 deploy <name> [--init-function <fn> --init-args <arg>...]" >&2
    exit 1
  fi
  shift

  INIT_FUNCTION=""
  INIT_ARGS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --init-function)
        INIT_FUNCTION="$2"
        shift 2
        ;;
      --init-args)
        shift
        INIT_ARGS=("$@")
        break
        ;;
      *)
        echo "unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done

  CC_LABEL="${CC_NAME}_${CC_VERSION}"
  CCAAS_IMAGE="${CC_NAME}-ccaas:${CC_VERSION}"
  mkdir -p "$GENERATED_DIR"

  trap on_deploy_error ERR

  stage 1 "building ${CC_NAME} ccaas docker image"
  require_dir "${CHAINCODE_ROOT_DIR}/${CC_NAME}" "no such chaincode — expected ${CHAINCODE_ROOT_DIR}/${CC_NAME}"
  build_ccaas_image

  declare -A PACKAGE_IDS
  local org_lines
  mapfile -t org_lines < <(active_org_lines)
  local line org_name org_msp

  if already_committed; then
    log "${CC_NAME} is already committed at sequence ${CC_SEQUENCE}/version ${CC_VERSION} — skipping package/install/approve/commit, recovering installed package IDs instead"
    stage 2 "recovering already-installed package IDs for ${CC_NAME}"
    for line in "${org_lines[@]}"; do
      read -r org_name org_msp <<< "$line"
      PACKAGE_IDS["$org_name"]=$(installed_package_id_for_org "$org_name" "$org_msp")
    done
  else
    stage 2 "packaging and installing ${CC_NAME} for every org"
    for line in "${org_lines[@]}"; do
      read -r org_name org_msp <<< "$line"
      PACKAGE_IDS["$org_name"]=$(package_and_install_for_org "$org_name" "$org_msp")
    done

    stage 3 "approving ${CC_NAME} for every org"
    for line in "${org_lines[@]}"; do
      read -r org_name org_msp <<< "$line"
      approve_for_org "$org_name" "$org_msp" "${PACKAGE_IDS[$org_name]}"
    done

    stage 4 "checking commit readiness and committing"
    check_commit_readiness
    commit_definition
  fi

  stage 5 "starting ${CC_NAME} chaincode-as-a-service containers"
  for line in "${org_lines[@]}"; do
    read -r org_name org_msp <<< "$line"
    start_ccaas_container "$org_name" "${PACKAGE_IDS[$org_name]}"
  done

  if [ -n "$INIT_FUNCTION" ]; then
    stage 6 "initializing ${CC_NAME} (${INIT_FUNCTION})"
    invoke_init
  else
    log "no --init-function given — skipping init (chaincode does not require one)"
  fi

  trap - ERR
  log "${CC_NAME} deployed and committed on channel ${CHANNEL_NAME} (sequence ${CC_SEQUENCE}, version ${CC_VERSION})"
}

case "${1:-}" in
  deploy)
    shift
    cmd_deploy "$@"
    ;;
  teardown)
    cmd_teardown
    ;;
  *)
    echo "usage: $0 <deploy <name> [--init-function <fn> --init-args <arg>...]|teardown>" >&2
    exit 1
    ;;
esac
