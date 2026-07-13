#!/usr/bin/env bash

# bootstrap-crypto.sh — enrolls real MSP material for the orderer (N Raft
# nodes) and every founding/member organization (M peers each), against
# Fabric CA containers it starts via the generated compose file.
#
# Called by network.sh up as an early step — nothing here is throwaway.
# Reads org/port data from network/config/network.yaml and
# network/deployment/local.yaml — never hardcodes an org name, node
# count, or port. Node counts are derived from the length of the port
# lists in deployment/local.yaml (orderer.nodes, each org's peers), not a
# separately hardcoded number here.
#
# Prerequisite: `blcgen generate compose` must have already run, since
# this script starts the CA containers via the compose file it produces
# rather than defining them itself — see docs/ERROR_LOG.md /
# docs/BUILD_LOG.md's Phase 6 entry for why CA container definitions
# live in exactly one place (the compose template) instead of being
# duplicated between this script and generated/docker-compose-ca.yaml.

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # always run relative to network/
source "scripts/lib/common.sh"
# wait_for_ca/write_node_ous/enroll_node/bootstrap_org live in
# lib/crypto.sh — shared with org-add.sh (Phase 9), which calls
# bootstrap_org for exactly one new org rather than looping over every
# founding/member org the way this script does.
source "scripts/lib/crypto.sh"

log "reading organizations from ${NETWORK_YAML} / ${LOCAL_YAML}"

require_file "$CA_COMPOSE_FILE" "run 'blcgen generate compose' first"

log "starting CA containers via ${CA_COMPOSE_FILE}"
docker compose -f "$CA_COMPOSE_FILE" up -d

ORDERER_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['orderer']['name'])")
ORDERER_MSP=$(python3 -c "import yaml; print(yaml.safe_load(open('${NETWORK_YAML}'))['orderer']['msp'])")
ORDERER_CA_PORT=$(python3 -c "import yaml; print(yaml.safe_load(open('${LOCAL_YAML}'))['orderer']['ca_port'])")
ORDERER_NODE_COUNT=$(python3 -c "import yaml; print(len(yaml.safe_load(open('${LOCAL_YAML}'))['orderer']['nodes']))")

bootstrap_org "$ORDERER_NAME" "$ORDERER_MSP" "$ORDERER_CA_PORT" "orderer" "$ORDERER_NODE_COUNT"

python3 - "$NETWORK_YAML" "$LOCAL_YAML" <<'PY' > /tmp/blc-orgs.$$
import sys, yaml

net = yaml.safe_load(open(sys.argv[1]))
dep = yaml.safe_load(open(sys.argv[2]))

for org in net["organizations"]:
    if org["status"] in ("founding", "member"):
        dep_org = dep["organizations"][org["name"]]
        print(f'{org["name"]} {org["msp"]} {dep_org["ca_port"]} {len(dep_org["peers"])}')
PY

while read -r name msp ca_port peer_count; do
  bootstrap_org "$name" "$msp" "$ca_port" "peer" "$peer_count"
done < /tmp/blc-orgs.$$
rm -f /tmp/blc-orgs.$$

log "all identities enrolled. Crypto material is under ${CRYPTO_DIR}"
