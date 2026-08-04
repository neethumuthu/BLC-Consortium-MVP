import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Backs ApiKeyGuard's expected credential and the change-credential
// endpoint - see openspec/changes/password-change/design.md's
// Decisions for why this is a small local file read fresh on every
// call rather than .env (not re-read after startup) or a database
// (overkill for one string). Filename is keyed by MSP_ID, not fixed,
// because every institution's backend instance runs from this same
// checked-out `backend/` directory (just with a different ENV_FILE) -
// a shared filename would collide across instances.
@Injectable()
export class CredentialStoreService {
  private readonly storePath: string;

  constructor(private readonly config: ConfigService) {
    const mspId = this.config.getOrThrow<string>('MSP_ID');
    this.storePath = join(process.cwd(), `credential-store.${mspId.toLowerCase()}.json`);
  }

  getCurrent(): string {
    if (existsSync(this.storePath)) {
      const { credential } = JSON.parse(readFileSync(this.storePath, 'utf-8')) as {
        credential: string;
      };
      return credential;
    }
    // First-boot bootstrap path, per design.md's Risks: no rotation
    // has happened yet, so fall back to the deploy-time value.
    return this.config.getOrThrow<string>('API_KEY');
  }

  setCredential(newCredential: string): void {
    writeFileSync(this.storePath, JSON.stringify({ credential: newCredential }), 'utf-8');
  }
}
