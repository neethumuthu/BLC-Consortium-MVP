## Why

**Retroactive change — created after the code was already committed
(`5b95edd`), per a Ring 2 review finding on PR #25**: bundling an
infra/config fix (`network/deployment/local.yaml`) together with a
`context/` doc edit (`CONCERNS.md`) in one commit, with no change-id and
no `docs/BUILD_LOG.md` note, violates `context/rules/general.md` rules 5
("No code without a change-id") and 7 ("context/spec updates never as a
side effect of a feature commit") — the same pattern
`context/learnings/LEARNINGS.md`'s 2026-08-13 entry was written to stop.
Creating this now, honestly labeled as after-the-fact, per that entry's
own adopted remediation (a retroactive `skip_specs: true` change-id plus
a `docs/BUILD_LOG.md` note), rather than pretending the process was
followed correctly the first time.

The actual motivation, unchanged from when the code was written: ahead of
making this repo public (2026-08-17 team decision), rotate the CouchDB
admin password in `network/deployment/local.yaml` away from the
well-known Fabric-tutorial default (`adminpw`) — already fully
config-driven (local.yaml → Go config → template), so this is a
value-only change, no logic touched.

## What Changes

- `network/deployment/local.yaml`: `couchdb_admin_password` rotated to a
  generated value.
- `context/codebase/CONCERNS.md`: corrected a stale file citation for
  this field, and explicitly documented the separate CA
  bootstrap/org-admin credential gap (`admin:adminpw`, `orgadminpw`) as
  deferred, not fixed here — those aren't config-driven at all and
  touch `crypto.sh`'s `bootstrap_org`, flagged elsewhere in the same file
  as senior-human-only.
- `context/codebase/INTEGRATIONS.md` / `STACK.md`: corrected two other
  now-stale claims restating the old `admin`/`adminpw` CouchDB default,
  per Ring 2's rule-11 finding (grep the rest of `context/` for the same
  underlying fact, not just the one file a diff happened to touch).

No requirement text changes anywhere — this is infra config + docs only,
no `openspec/specs/` capability touched. `skip_specs: true` set
accordingly.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `network/deployment/local.yaml`
- `context/codebase/CONCERNS.md`
- `context/codebase/INTEGRATIONS.md`
- `context/codebase/STACK.md`

**Honestly note, not smoothed over:** Ring 2 also flagged (should-fix)
that rotating this value doesn't actually protect against anyone who
reads the now-public repo — only against a scanner keying off the
literal string `adminpw`. `CONCERNS.md`'s text already says this plainly.
The real fix (generate at bootstrap time, don't commit a default at all)
remains open, tracked in `CONCERNS.md`, not resolved by this change.
