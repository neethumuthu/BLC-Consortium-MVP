## 1. Fix

- [x] 1.1 `encodeURIComponent(id)` in `institutions/[id]/page.tsx`
- [x] 1.2 `encodeURIComponent(id)` in `certificates/[id]/page.tsx`
- [x] 1.3 **Added after Ring 2's second pass found a real, more exploitable gap:** `encodeURIComponent(certificateId)` in `actions/certificates.ts`'s `revokeCertificateAction`, `encodeURIComponent(proposalId)` in `actions/institutions.ts`'s `castVoteAction` — both read the ID raw off `FormData`, with no router in between to make a `/`-containing value harmless the way it is for the two page components above
- [x] 1.4 Grepped every `backendFetch(...)` template-literal path call site across `app/**/page.tsx` and `actions/*.ts` for the same shape — no other instance found
- [ ] 1.5 ~~Corrected `CONCERNS.md`/`LEARNINGS.md`'s "(resolved)" language to cover all four sites, not just the two from 1.1/1.2~~ — **moved to PR #37**, per Ring 2's fourth pass (rule 7: context/spec updates go through their own PR, never a feature-commit side effect). Reverted out of this branch in `d596527`.

## 2. Verify

- [x] 2.1 `npx tsc --noEmit` and `npx eslint` clean on all four changed files
