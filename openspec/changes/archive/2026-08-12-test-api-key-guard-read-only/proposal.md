## Why

`ApiKeyGuard`'s `READ_ONLY_API_KEY` behavior has zero automated test
coverage — it's currently verified only by manual `curl`/Playwright checks
(most recently, today, when a Ring 2 review caught a real mistake in
*which* credential got used for a manual check). Backend has no tests at
all yet, despite Jest/`@nestjs/testing` already being installed and
configured.

## What Changes

- Add `backend/src/common/guards/api-key.guard.spec.ts` covering all five
  behaviors: real key (any method), no read-only key configured (falls
  through to rejected), read-only key + GET (allowed), read-only key +
  non-GET (403), and no/wrong key (401).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this adds test coverage for existing, already-shipped behavior;
no requirement changes. `skip_specs: true` set in `.openspec.yaml`.)

## Impact

- `backend/src/common/guards/api-key.guard.spec.ts` (new file — the test
  itself).
- `backend/package.json` (a `"jest"` config block added — discovered mid-implementation
  that no Jest config existed anywhere in `backend/`, so the new test
  couldn't actually run at all. Contained fix: activates the already-installed
  `ts-jest` dependency, scoped to making this one file runnable, not a
  broader tooling change).
- `context/codebase/TESTING.md` (corrected an inaccurate claim found along
  the way — it stated backend ESLint was "configured"; `eslint` isn't
  actually installed in `backend/` at all. Fixing that for real is a
  separate, future task, not part of this change).
- No other production code changes.
