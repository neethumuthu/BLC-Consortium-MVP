import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// fabric-ca-client names each identity's MSP private key with an
// unpredictable hash, unlike TLS keys (which bootstrap-crypto.sh copies
// to a fixed tls/key.pem) — so the one *_sk file in an identity's
// keystore/ directory must be found by globbing, not by a fixed
// filename. Confirmed live 2026-07-20 against
// network/crypto/organizations/BLCFounder/users/Admin/msp/keystore/.
export function readSoleKeystoreFile(keystoreDir: string): Buffer {
  const candidates = readdirSync(keystoreDir).filter((name) => name.endsWith('_sk'));

  if (candidates.length === 0) {
    throw new Error(`No private key (*_sk) found in keystore directory: ${keystoreDir}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Expected exactly one private key in ${keystoreDir}, found ${candidates.length}: ${candidates.join(', ')}`,
    );
  }

  return readFileSync(join(keystoreDir, candidates[0]));
}
