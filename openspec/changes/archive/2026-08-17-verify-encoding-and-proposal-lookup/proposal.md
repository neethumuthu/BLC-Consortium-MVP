## Why

**Retroactive change — created after the code was already pushed (`fa08db3`, PR #29), per a Ring 2 review finding on that PR**: shipping two real behavioral changes with no `openspec/changes/<id>/` folder violates `context/rules/general.md` rule 5 ("No code without a change-id"). Creating this now, honestly labeled as after-the-fact, rather than pretending the process was followed correctly the first time — same remediation pattern already used for Phase 18/19.

The actual motivation, unchanged from when the code was written: fixing two real bugs filed by `agentic-qa` (issues #21, #22).

- **#21**: `certificates/verify/page.tsx` built the backend request path by interpolating the raw `searchParams` `id`, unencoded — a slash in the ID split the URL into extra path segments the backend's route never matched, leaking its raw `Cannot GET ...` 404 text into the UI.
- **#22**: the backend has fully supported `GET /institutions/proposals/:proposalId` since `institution-governance-ui`'s spec was extended to cover it (`2026-08-12-governance-proposal-lookup`, API-only), but no frontend route ever called it — no way to view a single proposal by its own URL.

## What Changes

- `certificates/verify/page.tsx`: `encodeURIComponent(id)` before building the backend request path. Verified live: this actually routes the request to the real business logic (not the router's own 404), so the user sees the same specific "couldn't find a certificate" message a normal nonexistent ID gets.
- `error-messages.ts`'s fallback (`humanizeBackendError`, no longer named `withDisplayNames`): any message not matching a known pattern now returns a fixed generic message instead of echoing raw backend/framework text (previously it substituted MSP display names into the raw text and returned that — itself how issue #21 went unnoticed).
- New `governance/[id]/page.tsx`, read-only, mirroring `institutions/[id]/page.tsx`'s existing detail-page pattern. Linked from both the open-proposals and recently-closed tables on `/governance`. Deliberately no vote action on this page — the list page already owns voting via `VoteButtons`; duplicating it here would create two sources of truth for the same action.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `institution-governance-ui`: the existing "Look up a single proposal by ID" requirement (API-only, from `2026-08-12-governance-proposal-lookup`) is extended to also cover the UI surface — a real page at `/governance/:id`, deliberately read-only.

## Impact

- `frontend/src/app/(dashboard)/certificates/verify/page.tsx`
- `frontend/src/lib/error-messages.ts`
- `frontend/src/app/(dashboard)/governance/[id]/page.tsx` (new)
- `frontend/src/app/(dashboard)/governance/page.tsx` (rows linked)
- `openspec/specs/institution-governance-ui/spec.md` — one requirement modified (see delta spec)
