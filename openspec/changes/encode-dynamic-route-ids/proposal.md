## Why

Flagged by `context-gardener` (PR #33): `institutions/[id]/page.tsx` and `certificates/[id]/page.tsx` build their backend request path the same unencoded way `certificates/verify/page.tsx` did before issue #21's fix.

**Correcting the framing before fixing it, not just applying the fix blindly**: this is *not* actually the same exploitable bug as #21. Issue #21's own original report explicitly tested and confirmed that Next.js does not decode `%2F` in dynamic route segments (unlike query-string parameters, which it fully decodes) — a slash-containing ID reaching `institutions/[id]`/`certificates/[id]` can't split the backend request path the way it did on the query-param-driven verify page; the router itself would treat a raw `/` as an additional path segment before ever reaching the page component. So the specific leak issue #21 fixed isn't reproducible here.

`encodeURIComponent(id)` at both sites is still applied — a small, safe, zero-risk consistency fix matching the rest of the codebase's pattern for any ID used in a backend request path, not a critical vulnerability fix.

**Second commit, same day — a real finding from Ring 2's second pass, not defensive hardening:** the reasoning above (page-component route segments aren't exploitable) was used to close out the whole concern, but two sibling sites remained that genuinely are exploitable: `actions/certificates.ts`'s `revokeCertificateAction` and `actions/institutions.ts`'s `castVoteAction` interpolate `certificateId`/`proposalId` read raw off `FormData` — no router in between at all, unlike the page components. A `/`-containing form value would have split the backend path the same way issue #21's original bug did. Grepped every `backendFetch(...)` call site with a template-literal path across `app/**/page.tsx` and `actions/*.ts`; no other instance found (the dashboard's own `` `/institutions/${session.institutionId}/certificates` `` is not a sibling — that ID comes from a signed-JWT session claim, not free text).

## What Changes

- `institutions/[id]/page.tsx`, `certificates/[id]/page.tsx`: wrap the `id` param in `encodeURIComponent()` before building the backend fetch path.
- `actions/certificates.ts`'s `revokeCertificateAction`, `actions/institutions.ts`'s `castVoteAction`: same fix on `certificateId`/`proposalId`, both read raw off `FormData` — a real exploitable gap, not just consistency hardening.
- Corrected `CONCERNS.md`/`LEARNINGS.md`'s "(resolved)" language, which overstated what was actually closed by the first commit alone.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — no capability behavior change; the backend already accepted encoded IDs identically, this only fixes how the frontend builds the request)

## Impact

- `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`
- `frontend/src/app/(dashboard)/certificates/[id]/page.tsx`
- `frontend/src/actions/certificates.ts`
- `frontend/src/actions/institutions.ts`
- `context/codebase/CONCERNS.md`, `context/learnings/LEARNINGS.md` — corrected, not just added to
