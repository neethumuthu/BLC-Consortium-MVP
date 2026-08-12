import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard';
import { CredentialStoreService } from '../../auth/credential-store.service';

const REAL_KEY = 'real-key-123';

function makeContext(headers: Record<string, string>, method: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, method }),
    }),
  } as ExecutionContext;
}

async function buildGuard(readOnlyKey?: string): Promise<ApiKeyGuard> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ApiKeyGuard,
      { provide: CredentialStoreService, useValue: { getCurrent: () => REAL_KEY } },
      { provide: ConfigService, useValue: { get: () => readOnlyKey } },
    ],
  }).compile();

  return moduleRef.get(ApiKeyGuard);
}

describe('ApiKeyGuard', () => {
  it('allows the real key on any HTTP method', async () => {
    const guard = await buildGuard();
    const context = makeContext({ authorization: `Bearer ${REAL_KEY}` }, 'POST');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a read-only-shaped header when no READ_ONLY_API_KEY is configured', async () => {
    const guard = await buildGuard(undefined);
    const context = makeContext({ authorization: 'Bearer some-guest-key' }, 'GET');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('allows the read-only key on GET when configured', async () => {
    const guard = await buildGuard('guest-key-456');
    const context = makeContext({ authorization: 'Bearer guest-key-456' }, 'GET');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects the read-only key on a non-GET method', async () => {
    const guard = await buildGuard('guest-key-456');
    const context = makeContext({ authorization: 'Bearer guest-key-456' }, 'POST');

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('This is a read-only credential - it cannot perform write actions');
  });

  it('rejects a missing or wrong key entirely', async () => {
    const guard = await buildGuard('guest-key-456');
    const context = makeContext({}, 'GET');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
