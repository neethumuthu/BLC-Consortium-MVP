## 1. Build (already done, marked retroactively)

- [x] 1.1 New page `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`,
  mirroring `certificates/[id]/page.tsx`'s pattern
- [x] 1.2 Link each row on the institutions list page to it
- [x] 1.3 Render `approvedBy` MSP IDs through `displayNameFor()`, not raw
  (Ring 2 review finding on PR #18, fixed same day)

## 2. Verify (already done, marked retroactively)

- [x] 2.1 Live-verify in a real browser: a founding institution (no
  `approvedBy`), an approved institution (with `approvedBy`), and a
  nonexistent ID (clean error state, not a crash)

## 3. Archive

- [x] 3.1 Archive this change
