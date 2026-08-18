## Why

Filed by the Ring 3 goal-driven QA agent (issue #31): `certificate-lifecycle/spec.md`'s "List an institution's certificates" requirement has been API-only since it was written — `GET /institutions/:institutionId/certificates` works for any institution, no membership restriction — but no frontend route ever called it for any institution other than the caller's own (the dashboard always uses `session.institutionId`). Same shape of gap as issue #22 (governance proposal-by-id), on a different spec/endpoint.

## What Changes

- `institutions/[id]/page.tsx`: adds a "Certificates issued" section below the existing institution details, calling the already-working `GET /institutions/:institutionId/certificates` endpoint for whichever institution's page is being viewed — not just the caller's own.
- `certificate-table.tsx`: the existing dashboard-shared component gets a new `showIssueAction` prop (default `true`, unchanged for the dashboard's own usage) so the empty state doesn't offer an "Issue your first certificate" action when viewing another institution's page — you can't issue on their behalf.
- `encodeURIComponent(id)` applied on both backend calls this page now makes, matching the established pattern from issue #21/#22's fixes.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `certificate-lifecycle`: extends "List an institution's certificates" to cover the UI surface (previously API-only), same treatment as `institution-governance-ui`'s "Look up a single proposal by ID" got for issue #22.

## Impact

- `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`
- `frontend/src/components/certificate-table.tsx`
- `openspec/specs/certificate-lifecycle/spec.md` — one requirement modified (see delta spec)
