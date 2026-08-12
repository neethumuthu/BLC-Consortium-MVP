## 1. `api-key.guard.spec.ts`

- [x] 1.1 Set up `Test.createTestingModule` with mocked `CredentialStoreService` and `ConfigService` providers
- [x] 1.2 Test: real key, any HTTP method → `canActivate` returns `true`
- [x] 1.3 Test: no `READ_ONLY_API_KEY` configured, read-only-shaped header presented → throws `UnauthorizedException`
- [x] 1.4 Test: `READ_ONLY_API_KEY` configured, matching header, `GET` → returns `true`
- [x] 1.5 Test: `READ_ONLY_API_KEY` configured, matching header, non-`GET` → throws `ForbiddenException` with the exact message
- [x] 1.6 Test: no header / wrong value entirely → throws `UnauthorizedException`

## 1a. Unblock the test run (discovered mid-implementation, not originally scoped)

- [x] 1a.1 Add a Jest config (`ts-jest` preset) to `package.json` — `npm test` failed
  before any test ran; no Jest config existed anywhere in `backend/`, so the
  default Babel transform choked on TypeScript syntax. Contained fix: 11 lines,
  activates an already-installed dependency (`ts-jest`), scoped to making this
  one new file runnable.

## 2. Verify

- [x] 2.1 Run `npm test` in `backend/` — all 5 cases pass
- [~] 2.2 Run `npm run lint` in `backend/` — **dropped from this change's scope.**
  `eslint` itself isn't installed in `backend/` at all (not in `package.json`,
  not in `node_modules`, no config file) — `npm run lint` fails with
  `eslint: not found`, unrelated to this change's file. Unlike the Jest gap,
  fixing this properly means installing a new dependency and running it for
  the first time ever against ~80 existing files nobody has checked —
  real, separate scope, not a contained unblock. ~~Corrected
  `context/codebase/TESTING.md`'s inaccurate "ESLint is configured for
  backend" claim instead of leaving it standing.~~ **Correction, added
  after archiving (PR #16's Ring 2 review caught this):** that
  `TESTING.md` edit was reverted from this change's PR (#15) before merge
  — a context edit can't ride along with a feature commit, per
  `general.md` rule 7 — and landed instead in a separate dedicated PR
  (#16). Setting up backend ESLint for real is a separate, future task.
