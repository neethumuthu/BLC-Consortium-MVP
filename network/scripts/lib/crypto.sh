# scripts/lib/crypto.sh — per-org Fabric CA enrollment, shared by
# bootstrap-crypto.sh (loops over every founding/member org at network
# bootstrap) and org-add.sh (calls bootstrap_org for exactly one new
# org, incrementally, without touching any other org's crypto material).
#
# Extracted from bootstrap-crypto.sh verbatim — no behavior change, only
# code motion, so a script that already worked continues to work
# identically. Depends on common.sh's log()/CRYPTO_DIR being sourced
# first; does not source it itself, to avoid double-sourcing when both
# are pulled in by the same caller.

wait_for_ca() {
  local port="$1"
  local tries=30
  until curl -s "http://localhost:${port}/cainfo" > /dev/null 2>&1; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "CA on port ${port} did not become ready in time" >&2
      exit 1
    fi
    sleep 1
  done
}

# write_node_ous writes the NodeOUs config.yaml that lets Fabric tell
# admins/peers/orderers/clients apart by the OU embedded in their
# certificate, all verified against the same CA root cert.
write_node_ous() {
  local msp_dir="$1"
  local ca_cert_file="$2"

  cat > "${msp_dir}/config.yaml" <<EOF
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${ca_cert_file}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${ca_cert_file}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${ca_cert_file}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${ca_cert_file}
    OrganizationalUnitIdentifier: orderer
EOF
}

# enroll_node registers and enrolls one node identity (a peer or an
# orderer) plus its TLS certificate. TLS material is nested under the
# node's own name (org_dir/{orderers|peers}/<node_name>/tls/) since an
# org can now have more than one node — there's no single "the" node to
# keep it flat for anymore.
#
# Args: org_dir registrar_home ca_port node_type node_name
enroll_node() {
  local org_dir="$1" registrar_home="$2" ca_port="$3" node_type="$4" node_name="$5"

  local node_kind_dir="peers"
  [ "$node_type" = "orderer" ] && node_kind_dir="orderers"
  local node_home="${org_dir}/${node_kind_dir}/${node_name}"

  log "registering ${node_type} identity ${node_name}"
  FABRIC_CA_CLIENT_HOME="$registrar_home" \
    fabric-ca-client register \
      --id.name "$node_name" \
      --id.secret "${node_name}pw" \
      --id.type "$node_type" \
      -u "http://localhost:${ca_port}" > /dev/null

  log "enrolling ${node_type} identity ${node_name}"
  mkdir -p "$node_home"
  FABRIC_CA_CLIENT_HOME="$node_home" \
    fabric-ca-client enroll -u "http://${node_name}:${node_name}pw@localhost:${ca_port}" > /dev/null

  # The running orderer/peer process loads this node's own msp/ as its
  # *local* MSP — a separate MSP instance from the org-level one
  # assembled in bootstrap_org, which configtx.yaml reads. Without
  # NodeOUs config here too, Fabric panics on startup: "administrators
  # must be declared when no admin ou classification is set." (Found
  # the hard way: every prior use of this crypto material only touched
  # the org-level MSP via configtxgen, which never exercises the local
  # MSP loader — this is the first time anything actually started an
  # orderer/peer process against it.)
  local node_ca_cert_file
  node_ca_cert_file=$(basename "$(ls "${node_home}/msp/cacerts/"*.pem | head -1)")
  write_node_ous "${node_home}/msp" "$node_ca_cert_file"

  log "enrolling TLS certificate for ${node_name}"
  FABRIC_CA_CLIENT_HOME="$node_home" \
    fabric-ca-client enroll \
      -u "http://${node_name}:${node_name}pw@localhost:${ca_port}" \
      --enrollment.profile tls \
      --csr.hosts localhost \
      --csr.hosts "${node_name}.${org_dir##*/}" \
      -M "${node_home}/tls" > /dev/null

  # fabric-ca-client names the TLS private key with a SHA-256 hash
  # (e.g. 98dcc4a9...+_sk), but CORE_PEER_TLS_KEY_FILE /
  # ORDERER_GENERAL_TLS_PRIVATEKEY need one exact, predictable path.
  # Copy it to a fixed name so the compose templates (and org-add.sh's
  # own raw docker run) can reference it directly, the same way
  # fabric-samples' own enrollment scripts do.
  cp "${node_home}/tls/keystore/"*_sk "${node_home}/tls/key.pem"
  cp "${node_home}/tls/tlscacerts/"*.pem "${node_home}/tls/ca.pem"
}

# bootstrap_org enrolls the CA's bootstrap identity as an internal-only
# registrar, registers+enrolls a real Admin identity (type "admin") against
# an already-running CA container, enrolls node_count node identities
# (peers or orderer nodes, named <node_type>0..<node_type>(node_count-1))
# plus each one's TLS certificate, then assembles the org-level MSP
# directory that configtx.yaml reads. The CA container itself must
# already be up before calling this.
#
# Args: org_name msp_id ca_port node_type node_count
bootstrap_org() {
  local org="$1" msp="$2" ca_port="$3" node_type="$4" node_count="$5"

  local org_dir="${CRYPTO_DIR}/organizations/${org}"
  local admin_home="${org_dir}/users/Admin"
  local registrar_home="${CRYPTO_DIR}/ca-bootstrap/${org}"

  wait_for_ca "$ca_port"

  # The CA's own bootstrap identity ("admin"/"adminpw", created by the CA
  # server itself at startup) is type "client" by default — enrolling it
  # directly as an org's channel Admin embeds OU=client in the cert, not
  # OU=admin, so NodeOUs classification never recognizes it as an admin
  # no matter what config.yaml says ("The identity does not contain OU
  # [ADMIN]", "is not an admin under this MSP"). Found the hard way: it
  # passed every enrollment/MSP-assembly step silently and only surfaced
  # once a peer actually policy-checked the identity's role, at channel
  # join. Enroll it into its own separate, internal-only home and use it
  # solely as a *registrar* — never as the org's Admin identity — exactly
  # how fabric-samples' own registerEnroll.sh splits these two roles.
  log "enrolling CA bootstrap identity for ${org} (registrar only, not used as the org's Admin)"
  mkdir -p "$registrar_home"
  FABRIC_CA_CLIENT_HOME="$registrar_home" \
    fabric-ca-client enroll -u "http://admin:adminpw@localhost:${ca_port}" > /dev/null

  log "registering Admin identity for ${org}"
  FABRIC_CA_CLIENT_HOME="$registrar_home" \
    fabric-ca-client register \
      --id.name orgadmin \
      --id.secret orgadminpw \
      --id.type admin \
      -u "http://localhost:${ca_port}" > /dev/null

  log "enrolling Admin identity for ${org}"
  mkdir -p "$admin_home"
  FABRIC_CA_CLIENT_HOME="$admin_home" \
    fabric-ca-client enroll -u "http://orgadmin:orgadminpw@localhost:${ca_port}" > /dev/null

  # The peer/osnadmin CLI loads this Admin identity's own msp/ as its
  # *local* MSP when it signs a request (e.g. `peer channel join`,
  # `osnadmin channel join`) — same local-MSP loader as an orderer/peer
  # process, and it panics/errors the same way without NodeOUs config:
  # "administrators must be declared when no admin ou classification is
  # set." (Same root cause as enroll_node's node-MSP fix above, just
  # never applied here since this MSP is only ever used as a *signer*,
  # not started as a long-running process — easy to miss.)
  local admin_ca_cert_file
  admin_ca_cert_file=$(basename "$(ls "${admin_home}/msp/cacerts/"*.pem | head -1)")
  write_node_ous "${admin_home}/msp" "$admin_ca_cert_file"

  # The orderer org's Admin also needs a TLS client identity: osnadmin's
  # channel-join endpoint requires mutual TLS (ORDERER_ADMIN_TLS_
  # CLIENTAUTHREQUIRED=true, set in docker/orderer-base.yaml), so the
  # caller must present a TLS cert/key trusted by the same CA, not just
  # a regular signing identity. Institution orgs don't need this — peer
  # channel join only requires one-way TLS plus Admin's regular
  # identity, since CORE_PEER_TLS_CLIENTAUTHREQUIRED was never set.
  if [ "$node_type" = "orderer" ]; then
    log "enrolling TLS certificate for ${org}'s Admin (required by osnadmin's mutual-TLS admin endpoint)"
    FABRIC_CA_CLIENT_HOME="$admin_home" \
      fabric-ca-client enroll \
        -u "http://orgadmin:orgadminpw@localhost:${ca_port}" \
        --enrollment.profile tls \
        --csr.hosts localhost \
        -M "${admin_home}/tls" > /dev/null
    cp "${admin_home}/tls/keystore/"*_sk "${admin_home}/tls/key.pem"
    cp "${admin_home}/tls/tlscacerts/"*.pem "${admin_home}/tls/ca.pem"
  fi

  local i=0
  while [ "$i" -lt "$node_count" ]; do
    enroll_node "$org_dir" "$registrar_home" "$ca_port" "$node_type" "${node_type}${i}"
    i=$((i + 1))
  done

  log "assembling org-level MSP for ${org}"
  mkdir -p "${org_dir}/msp/cacerts" "${org_dir}/msp/admincerts" "${org_dir}/msp/tlscacerts"
  local ca_cert_file
  ca_cert_file=$(basename "$(ls "${admin_home}/msp/cacerts/"*.pem | head -1)")
  cp "${admin_home}/msp/cacerts/${ca_cert_file}" "${org_dir}/msp/cacerts/"
  cp "${admin_home}/msp/signcerts/cert.pem" "${org_dir}/msp/admincerts/"
  write_node_ous "${org_dir}/msp" "$ca_cert_file"

  # The org-level MSP embedded in configtx.yaml's genesis block also
  # needs the TLS root CA cert (tlscacerts/), not just the regular
  # identity CA cert (cacerts/) — otherwise Fabric has no trusted TLS
  # root to verify a Raft consenter's (or any node's) TLS certificate
  # against, and rejects it as "signed by unknown authority" even
  # though the cert itself is perfectly valid. Sourced from the first
  # enrolled node of this org (works for institution orgs too, whose
  # Admin never gets a TLS enrollment — only the orderer org's Admin
  # does, per the mutual-TLS block above).
  local first_node_kind_dir="peers"
  [ "$node_type" = "orderer" ] && first_node_kind_dir="orderers"
  cp "${org_dir}/${first_node_kind_dir}/${node_type}0/tls/ca.pem" "${org_dir}/msp/tlscacerts/"

  log "done: ${org} (${msp}) — ${node_count} ${node_type} node(s)"
}
