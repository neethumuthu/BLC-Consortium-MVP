# scripts/lib/orgs.sh — org/peer enumeration helpers, shared by
# chaincode.sh (loops over every founding/member org) and org-add.sh
# (Phase 9 — needs to enumerate the EXISTING founding/member orgs to
# query one of them, and to collect their admins' signatures for a
# channel config-update).
#
# Extracted from chaincode.sh verbatim — no behavior change, only code
# motion.

# active_org_lines prints "<org> <msp>" for every founding/member org.
active_org_lines() {
  python3 -c "
import yaml
net = yaml.safe_load(open('${NETWORK_YAML}'))
for org in net['organizations']:
    if org['status'] in ('founding', 'member'):
        print(f\"{org['name']} {org['msp']}\")
"
}

# org_peer_lines prints "<peer_name> <peer_port>" for every peer of the
# given org.
org_peer_lines() {
  local org_name="$1"
  python3 -c "
import yaml
dep = yaml.safe_load(open('${LOCAL_YAML}'))
dep_org = dep['organizations']['${org_name}']
for i, p in enumerate(dep_org['peers']):
    print(f\"peer{i} {p['peer_port']}\")
"
}
