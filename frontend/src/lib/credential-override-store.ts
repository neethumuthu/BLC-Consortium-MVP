import "server-only";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Backs backendFetch's per-institution credential lookup after a
// runtime rotation via /auth/credential. Without this, the frontend's
// INSTITUTIONS array (institutions.ts) keeps using whatever apiKey was
// baked in from .env.local at module load - stale the instant a
// backend's credential is rotated, requiring a manual .env.local edit
// and restart. Same "small local file, read fresh every time" pattern
// as the backend's own CredentialStoreService, keyed by institutionId
// rather than one-file-per-instance since this single frontend process
// holds credentials for every institution it can act as.
const STORE_PATH = path.join(process.cwd(), "credential-overrides.json");

function readStore(): Record<string, string> {
  if (!existsSync(STORE_PATH)) {
    return {};
  }
  return JSON.parse(readFileSync(STORE_PATH, "utf-8")) as Record<string, string>;
}

export function getCredentialOverride(institutionId: string): string | undefined {
  return readStore()[institutionId];
}

export function setCredentialOverride(institutionId: string, credential: string): void {
  const store = readStore();
  store[institutionId] = credential;
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}
