## Context

See proposal.md for motivation. Worth restating one grounding fact: the backend has no database of its own today — it's a pure Fabric gateway proxy (`fabric-gateway.service.ts`), and `API_KEY` is read once at startup via NestJS `ConfigModule` from a `.env` file (`app.module.ts`). There is nowhere existing to persist a runtime-changeable value.

## Goals / Non-Goals

**Goals:**
- Let an institution change its credential without a backend redeploy.
- Keep the existing `Authorization: Bearer <credential>` check on every request unchanged in mechanism.

**Non-Goals:**
- Per-user accounts (explicitly ruled out by Dominik).
- Any change to how other endpoints authenticate — only the source of the expected credential value changes.
- A shared/global credential store across institutions — each institution runs its own backend instance today, and this stays true.

## Decisions

**Store the credential in a small local file, separate from `.env`, read by `ApiKeyGuard` on every request rather than cached at startup.**

Alternatives considered:
- *Rewrite `.env` itself at runtime*: rejected. Conflates deploy-time configuration with runtime-mutable state, and NestJS's `ConfigService` doesn't re-read `.env` after startup anyway — a change wouldn't take effect without a restart, defeating the point.
- *A full local database (e.g. SQLite) for one value*: rejected as overkill. This backend has no other need for persistent local storage; introducing one for a single string is disproportionate.
- *A small dedicated local file* (e.g. `credential-store.json`, outside `.env`): chosen. Minimal new surface, survives the process without a restart, and reading it fresh on every request (rather than caching in memory) means a change takes effect immediately, matching the "current credential stops working right away" scenario in specs.

**The change-credential endpoint requires the current credential, not a separate admin/master key.** Matches the existing trust model (whoever holds the current credential IS the institution, no separate identity layer exists) — introducing a master key would be a bigger, unrequested change to the auth model.

**The frontend also gets its own local credential-override store, keyed by institutionId, checked before its `.env.local`-sourced value.**

Found while scoping the change-credential form: `frontend/src/lib/institutions.ts` bakes each institution's `apiKey` in once at module load from `frontend/.env.local` — completely separate from the backend's own credential. Rotating the backend's credential through the UI, with nothing else changed, would leave the frontend sending the old value on its very next request, breaking every action (not a logout — the frontend session is unrelated, see `session.ts`'s independent `SESSION_SECRET` — but every backend-calling action would fail with an error) until someone manually edited `.env.local` and restarted. That reintroduces the exact "needs a redeploy/restart to fix" problem this feature exists to remove, just moved from backend to frontend.

Mirrors the backend's own decision above: a small local file (`frontend/credential-overrides.json`), read fresh on every `backendFetch` call rather than cached, checked first and falling back to the `.env.local` value. The change-credential server action only writes to it *after* the backend confirms the rotation succeeded — writing it first and having the backend reject the change would lock the frontend out of a credential the backend never actually accepted.

## Risks / Trade-offs

- [Risk] Reading a local file on every request adds I/O to the hot path of every single API call → [Mitigation] the file is tiny (one string) and local disk; this project's actual traffic volume doesn't approach a scale where this matters. Not solving for a scale this project doesn't have.
- [Risk] If the local file is lost (container rebuilt without a persistent volume), the credential resets to whatever's in `.env` as a fallback → [Mitigation] `ApiKeyGuard` should fall back to `.env`'s `API_KEY` if the local file doesn't exist yet, so a fresh deploy isn't locked out; this is also the natural bootstrap path (first `.env`-provided value, then rotatable afterward).
