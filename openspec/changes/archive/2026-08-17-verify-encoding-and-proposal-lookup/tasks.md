## 1. Fix (already done, marked retroactively)

- [x] 1.1 `encodeURIComponent(id)` in `certificates/verify/page.tsx` (issue #21)
- [x] 1.2 Harden `humanizeBackendError`'s fallback to a fixed generic message, dropping the raw-text-with-MSP-substitution "safety net" that let issue #21 leak through unnoticed
- [x] 1.3 Audit every other `searchParams`-driven `backendFetch` call site for the same missing-encoding pattern — confirmed `verify/page.tsx` was the only one
- [x] 1.4 New `governance/[id]/page.tsx`, read-only detail page (issue #22)
- [x] 1.5 Link both `/governance` tables (open proposals, recently closed) to the new detail page

## 2. Verify (already done, marked retroactively)

- [x] 2.1 `npx tsc --noEmit` and `npx eslint` clean
- [x] 2.2 `humanizeBackendError` verified directly (Node script) against the exact reported "Cannot GET ..." string and a script-tag payload
- [x] 2.3 Live-verified on staging (temporary branch deploy, restored to `main` afterward): `/certificates/verify?id=abc/def` shows the proper humanized not-found message; `/governance/<real-proposal-id>` renders full correct data

## 3. Spec sync (added retroactively, per Ring 2 should-fix on PR #29)

- [x] 3.1 Modify `institution-governance-ui`'s "Look up a single proposal by ID" requirement to cover the new UI surface, not just the API
- [x] 3.2 Add a "read-only by design" scenario, since that was a deliberate decision (list page owns voting) not obvious from the requirement text alone

## 4. Archive

- [x] 4.1 Archive this change
