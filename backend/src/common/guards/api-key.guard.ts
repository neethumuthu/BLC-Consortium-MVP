import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CredentialStoreService } from '../../auth/credential-store.service';

// Every route in this instance requires Authorization: Bearer <API_KEY>,
// applied globally in main.ts. This is the fix for ARCHITECTURE.md's
// "no HTTP auth" gap: without it, any network-reachable caller could
// invoke IssueCertificate/RevokeCertificate as this instance's
// institution with zero credential.
//
// READ_ONLY_API_KEY (optional) is a second, weaker credential added
// 2026-08-11 after agentic-qa's own real BLCFounder login let it
// complete real ProposeNewMember/CastVote calls on the shared staging
// ledger. A caller presenting this key instead of the real one is
// authenticated but restricted to GET - it can browse every read
// endpoint but any mutating route (propose/vote/issue/revoke/rotate)
// is rejected here, before it ever reaches the chaincode. Unset by
// default, so instances that don't need a guest login are unaffected.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly credentialStore: CredentialStoreService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['authorization'];
    const expected = this.credentialStore.getCurrent();

    if (header === `Bearer ${expected}`) {
      return true;
    }

    const readOnlyKey = this.config.get<string>('READ_ONLY_API_KEY');
    if (readOnlyKey && header === `Bearer ${readOnlyKey}`) {
      if (request.method !== 'GET') {
        throw new ForbiddenException('This is a read-only credential - it cannot perform write actions');
      }
      return true;
    }

    throw new UnauthorizedException('Missing or invalid API key');
  }
}
