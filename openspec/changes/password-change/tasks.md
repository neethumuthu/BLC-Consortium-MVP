## 1. Backend

- [x] 1.1 Add a small local credential store (a dedicated file, not `.env`) that `ApiKeyGuard` reads fresh on every request
- [x] 1.2 `ApiKeyGuard` checks the local store first, falling back to `.env`'s `API_KEY` if the store doesn't exist yet (first-boot bootstrap path, per design.md)
- [x] 1.3 Add `POST /auth/credential` endpoint: verify current credential, write new one to the store
- [x] 1.4 Reject the change if the current credential presented doesn't match (per spec's "wrong current credential is rejected" scenario)

## 2. Frontend

- [x] 2.1 Add a change-credential form (current credential, new credential, confirm new credential) — `/settings`
- [x] 2.2 Call 1.3's endpoint; show success/failure clearly, including the specific "current credential was wrong" case
- [x] 2.3 (Added beyond original scope, see design.md's Decisions) Frontend-side credential-override store so rotating through the UI doesn't leave the frontend's own separate `.env.local`-sourced copy of the credential stale — closes the "you'd have to manually edit a file and restart the frontend" gap found while scoping 2.1/2.2.

## 3. Verification

- [x] 3.1 Verify end-to-end against the real backend: change the credential, confirm the old one is rejected and the new one works, per both scenarios in specs. Verified live against InstitutionB's real backend (rotate, confirm old 401s and new 200s, rotate back) both directly and through the actual `/settings` UI.
- [x] 3.2 Verify the `.env` fallback path: a fresh instance with no local store yet still authenticates against `API_KEY`. Confirmed live: BLCFounder and InstitutionA (never rotated) have no `credential-store.*.json` file and still authenticate correctly against their original `.env` `API_KEY`.
- [x] 3.3 Verify the frontend override fix end-to-end: rotate via the real `/settings` UI, then immediately navigate to another page (`/governance`) with no frontend restart — confirmed it loads with no error, using the rotated credential transparently.
- [x] 3.4 Verify wrong-current-credential rejection through the real UI form (not just the API) — confirmed "Current credential is incorrect" is shown and the stored credential is left unchanged.
