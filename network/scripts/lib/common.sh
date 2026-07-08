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
