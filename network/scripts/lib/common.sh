# scripts/lib/common.sh — shared bash utilities: path resolution,
# logging, error handling. Sourced by every script under scripts/,
# never executed directly (no shebang, no execute bit).
#
# Every sourcing script must `cd` to network/ first — paths defined
# here are relative to network/, matching where blcgen's own constants
# (config/network.yaml, deployment/local.yaml, generated/, crypto/)
# already point.

set -Eeuo pipefail
# -E (errtrace) is required for the ERR trap to propagate into shell
# functions — without it, a failure inside a function silently doesn't
# fire an ERR trap set by its caller. Found the hard way: network.sh's
# stage-tracking error message didn't print when a failure happened
# inside a function (create_channel/join_peers).

trap 'echo "[error] ${BASH_SOURCE[1]:-$0}:${BASH_LINENO[0]}: command failed: ${BASH_COMMAND}" >&2' ERR

NETWORK_YAML="config/network.yaml"
LOCAL_YAML="deployment/local.yaml"
CRYPTO_DIR="$(pwd)/crypto"
GENERATED_DIR="generated"
CHANNEL_ARTIFACTS_DIR="channel-artifacts"

CA_COMPOSE_FILE="${GENERATED_DIR}/docker-compose-ca.yaml"
NET_COMPOSE_FILE="${GENERATED_DIR}/docker-compose-net.yaml"
GENESIS_BLOCK="${CHANNEL_ARTIFACTS_DIR}/genesis.pb"

# PEERCFG_DIR holds a vendored, unmodified core.yaml (see
# network/peercfg/core.yaml's own header) — the host `peer` CLI requires
# one to exist in its config search path, even though every setting
# that matters is overridden via CORE_PEER_* env vars. Every peer/
# osnadmin invocation must set FABRIC_CFG_PATH="$PEERCFG_DIR" explicitly
# rather than relying on the calling shell's ambient environment — a
# stray `export FABRIC_CFG_PATH=...` left over from manual configtxgen
# testing silently broke peer channel join once already.
PEERCFG_DIR="$(pwd)/peercfg"

# CHAINCODE_ROOT_DIR is the repo-level chaincode/ directory (a sibling of
# network/, not under it) — chaincode.sh resolves a chaincode's source
# by name as "${CHAINCODE_ROOT_DIR}/<name>", never a hardcoded path.
CHAINCODE_ROOT_DIR="$(cd .. && pwd)/chaincode"

# log prefixes every message with the invoking script's own name (not
# common.sh's), since $0 is unchanged by `source` — running
# network.sh prints "[network] ...", running bootstrap-crypto.sh
# directly (as we did all through Phase 4/5) still prints
# "[bootstrap-crypto] ...".
log() {
  echo "[$(basename "$0" .sh)] $*"
}

# require_file exits with a clear, specific error if path is missing —
# used to fail closed on missing prerequisites (e.g. "run blcgen
# generate compose first") instead of letting a later command fail with
# a confusing, unrelated error.
require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    echo "error: ${path} not found — ${hint}" >&2
    exit 1
  fi
}

# require_dir is require_file's directory counterpart — used by
# chaincode.sh to fail closed if a chaincode name doesn't resolve to a
# real source directory, instead of letting `peer lifecycle chaincode
# package` fail with a less specific error.
require_dir() {
  local path="$1" hint="$2"
  if [ ! -d "$path" ]; then
    echo "error: ${path} not found — ${hint}" >&2
    exit 1
  fi
}

# wait_for_port polls a raw TCP connection until it succeeds — used for
# orderer/peer readiness, which (unlike the CA) have no plain HTTP
# endpoint to poll. Shared by network.sh (waiting on every founding/
# member node) and org-add.sh (Phase 9 — waiting on one new org's own
# peers).
#
# Deliberately spawns a real subprocess (`timeout ... bash -c "exec
# 3<>..."`), not a bare `(exec 3<>...)` subshell — confirmed the bare
# form corrupts the CALLING shell's own fd 2 (stderr) for the rest of
# its life once the connection succeeds, silently swallowing every
# later `>&2` write, including a script's own "FAILED at stage N" trap
# message. A forced subprocess boundary doesn't leak that way. See
# docs/ERROR_LOG.md's 2026-07-10 entry for the full diagnosis.
wait_for_port() {
  local port="$1"
  local tries=30
  until timeout 1 bash -c "exec 3<>/dev/tcp/localhost/${port}" 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "port ${port} did not become ready in time" >&2
      exit 1
    fi
    sleep 1
  done
}
