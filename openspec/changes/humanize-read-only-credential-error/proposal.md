## Why

Filed by the Ring 3 QA agent as issue #43 ([improvement]): `ApiKeyGuard`
already rejects write attempts made with `READ_ONLY_API_KEY` with a
specific, human-readable 403 message ("This is a read-only credential -
it cannot perform write actions"), but `humanizeBackendError` has no
pattern matching it, so every such rejection shows the fixed generic
fallback ("Something went wrong. Please try again.") instead - even
though the backend already computed exactly why the request failed, in a
message that's static and safe to display verbatim (no raw chaincode/HTTP
internals leak, unlike issue #21).

## What Changes

- `frontend/src/lib/error-messages.ts`: add a `/read-only credential/`
  pattern to `humanizeBackendError`, returning a friendly explanation
  instead of the generic fallback.

## Impact

- `frontend/src/lib/error-messages.ts`
