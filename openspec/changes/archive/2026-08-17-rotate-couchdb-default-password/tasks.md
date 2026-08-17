## 1. Fix (already done, marked retroactively)

- [x] 1.1 Rotate `couchdb_admin_password` in `network/deployment/local.yaml`
- [x] 1.2 Correct `CONCERNS.md`'s stale file citation for this field
- [x] 1.3 Document the CA/org-admin credential gap as deferred, not silently dropped
- [x] 1.4 Fix the same stale `admin`/`adminpw` claim in `INTEGRATIONS.md` and `STACK.md` (Ring 2 rule-11 finding)

## 2. Verify (already done, marked retroactively)

- [x] 2.1 `blcgen validate` passes against the updated `local.yaml`

## 3. Archive

- [x] 3.1 Archive this change
