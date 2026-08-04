## Why

A password-change capability was requested by the PO. Scope confirmed by Dominik (2026-08-03): rotate the existing shared per-institution credential — no per-user accounts. Grounding check against the real implementation: `backend/src/common/guards/api-key.guard.ts` reads a single static `API_KEY` from environment config per backend instance — there is currently zero runtime/application path to change it; today it can only be changed by editing that env var and redeploying the institution's backend. This proposal is genuinely about introducing that missing runtime path, not just documenting the existing redeploy process.

## What Changes

- Move the per-institution credential from a static env var into a runtime-changeable, persisted value (backend needs some form of storage for it — a file, a small local store, or a database field, to be decided in `design.md`).
- New backend endpoint to change the credential: verify the current credential, then set the new one.
- New frontend UI: a simple change-credential form (current credential, new credential, confirm).
- `ApiKeyGuard` continues to check every request the same way; only where the expected value comes from changes.

## Capabilities

### New Capabilities
- `credential-rotation`: lets an institution change its own shared backend credential at runtime, without requiring a redeploy.

### Modified Capabilities
(none — this adds a new capability; `ApiKeyGuard`'s existing check-every-request behavior is unchanged, only the source of the expected value changes, which is an implementation detail, not a spec-level behavior change)

## Impact

- **Backend**: `ApiKeyGuard` needs to read the expected credential from somewhere mutable at runtime instead of `ConfigService` alone; new endpoint to change it.
- **Frontend**: new form, no existing page to extend (same as voting-governance-ui, this is new UI, not modifying something that exists).
- **Deployment**: worth noting as a design constraint — each institution runs its own backend instance, so this credential store must be per-instance, consistent with how `API_KEY` already works today (not a shared/global store across institutions).
