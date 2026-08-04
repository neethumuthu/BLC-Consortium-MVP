import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CredentialStoreService } from '../../auth/credential-store.service';

// Every route in this instance requires Authorization: Bearer <API_KEY>,
// applied globally in main.ts. This is the fix for ARCHITECTURE.md's
// "no HTTP auth" gap: without it, any network-reachable caller could
// invoke IssueCertificate/RevokeCertificate as this instance's
// institution with zero credential.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly credentialStore: CredentialStoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['authorization'];
    const expected = this.credentialStore.getCurrent();

    if (header !== `Bearer ${expected}`) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    return true;
  }
}
