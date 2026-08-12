## Context

`ApiKeyGuard` (`backend/src/common/guards/api-key.guard.ts`) has two
dependencies to isolate: `CredentialStoreService.getCurrent()` (the real
key) and `ConfigService.get('READ_ONLY_API_KEY')` (the optional read-only
key, unset by default). Both need mocking to test all five behaviors
deterministically.

## Goals / Non-Goals

**Goals:**
- Cover all five behaviors identified during exploration, each as its own
  test case.
- Use `@nestjs/testing`'s `Test.createTestingModule` with mocked
  providers — no real config file or credential store needed.

**Non-Goals:**
- Testing `main.ts`'s `app.useGlobalGuards()` wiring itself (that's
  integration-level, out of scope for a unit test).
- Adding tests for any other guard or route — scope stays exactly to this
  one file.

## Decisions

**Mock `ExecutionContext` by hand rather than pulling in `supertest`/a real
HTTP server.** `canActivate()` only reads
`context.switchToHttp().getRequest()`, so a minimal fake
(`{ switchToHttp: () => ({ getRequest: () => ({ headers, method }) }) }`)
is sufficient and keeps the test fast and dependency-free — `supertest` is
already installed for later, heavier integration tests, not needed here.

## Risks / Trade-offs

- [Risk] A hand-rolled `ExecutionContext` mock could drift from the real
  interface shape if NestJS changes it → [Mitigation] cast to
  `ExecutionContext` explicitly so TypeScript catches a shape mismatch at
  compile time, rather than a silent runtime gap.
