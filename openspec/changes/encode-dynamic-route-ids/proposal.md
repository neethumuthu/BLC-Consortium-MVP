## Why

Flagged by `context-gardener` (PR #33): `institutions/[id]/page.tsx` and `certificates/[id]/page.tsx` build their backend request path the same unencoded way `certificates/verify/page.tsx` did before issue #21's fix.

**Correcting the framing before fixing it, not just applying the fix blindly**: this is *not* actually the same exploitable bug as #21. Issue #21's own original report explicitly tested and confirmed that Next.js does not decode `%2F` in dynamic route segments (unlike query-string parameters, which it fully decodes) — a slash-containing ID reaching `institutions/[id]`/`certificates/[id]` can't split the backend request path the way it did on the query-param-driven verify page; the router itself would treat a raw `/` as an additional path segment before ever reaching the page component. So the specific leak issue #21 fixed isn't reproducible here.

`encodeURIComponent(id)` at both sites is still applied — a small, safe, zero-risk consistency fix matching the rest of the codebase's pattern for any ID used in a backend request path, not a critical vulnerability fix.

## What Changes

- `institutions/[id]/page.tsx`, `certificates/[id]/page.tsx`: wrap the `id` param in `encodeURIComponent()` before building the backend fetch path.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — no behavioral change for any currently-reachable input; defensive hardening only)

## Impact

- `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`
- `frontend/src/app/(dashboard)/certificates/[id]/page.tsx`
