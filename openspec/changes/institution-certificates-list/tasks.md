## 1. Fix

- [x] 1.1 Add a "Certificates issued" section to `institutions/[id]/page.tsx`, calling `GET /institutions/:institutionId/certificates`
- [x] 1.2 Add `showIssueAction` prop to `CertificateTable`, default `true` (dashboard unaffected), `false` on the institution detail page
- [x] 1.3 `encodeURIComponent(id)` on both backend calls this page makes

## 2. Verify

- [x] 2.1 `npx tsc --noEmit` and `npx eslint` clean
- [x] 2.2 Live-verified on staging (temporary branch deploy, restored to main afterward): BLCFounder shows a real certificate row, InstitutionC (no certs) shows the correct non-misleading empty state

## 3. Spec sync

- [x] 3.1 Modify `certificate-lifecycle`'s "List an institution's certificates" requirement to cover the UI surface, matching the treatment issue #22 got for `institution-governance-ui`

## 4. Archive

- [ ] 4.1 Archive this change
