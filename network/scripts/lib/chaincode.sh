# scripts/lib/chaincode.sh — per-org chaincode-as-a-service (ccaas)
# packaging, install, approval, and container lifecycle. Shared by
# chaincode.sh (loops over every founding/member org to deploy/commit a
# new chaincode definition) and org-add.sh (Phase 9 — calls the same
# per-org functions for exactly one new org approving an ALREADY-
# committed definition, never committing again itself).
#
# Extracted from chaincode.sh verbatim — no behavior change, only code
# motion. Every function here reads CC_NAME/CC_LABEL/CCAAS_IMAGE/
# CHANNEL_NAME/CC_VERSION/CC_SEQUENCE/INIT_FUNCTION/ORDERER_GENERAL_PORT/
# ORDERER_TLS_CA as globals the sourcing script must set before calling
# them — same convention as lib/crypto.sh's reliance on CRYPTO_DIR.
# Depends on common.sh's log()/CRYPTO_DIR/PEERCFG_DIR and orgs.sh's
# org_peer_lines being sourced first; does not source them itself, to
# avoid double-sourcing when both are pulled in by the same caller.

CCAAS_PORT="9999"

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
