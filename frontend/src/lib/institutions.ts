import "server-only";

// Login UI is cosmetic - not a substitute for the API key below. There
// is no real user database (one fixed account per institution), and the
// password is deliberately kept as a plain string comparison rather
// than hashed: hashing would protect against a credential-store leak
// separate from the source code, but here the "store" IS this source
// file, so hashing wouldn't reduce any actual risk - it'd just be
// security theater layered on top of security theater. See
// ARCHITECTURE.md's "Key decisions" #10/#11 for what this does and
// doesn't cover.
//
// apiKey is a REAL secret (required by the backend's ApiKeyGuard on
// every request) - unlike password, it must never be hardcoded here.
// It's read from frontend/.env.local (gitignored), matching the
// corresponding backend instance's own API_KEY env var.
export interface InstitutionAccount {
  institutionId: string;
  displayName: string;
  email: string;
  password: string;
  baseUrl: string;
  apiKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} - see frontend/.env.local`);
  }
  return value;
}

export const INSTITUTIONS: InstitutionAccount[] = [
  {
    institutionId: "BLCFounderMSP",
    displayName: "BLC Founder",
    email: "admin@blcfounder.org",
    password: "Fo6nder!Portal",
    baseUrl: "http://localhost:3001",
    apiKey: requireEnv("BLCFOUNDER_API_KEY"),
  },
  {
    institutionId: "InstitutionAMSP",
    displayName: "Institution A",
    email: "admin@institutiona.edu",
    password: "InstA!Portal9",
    baseUrl: "http://localhost:3002",
    apiKey: requireEnv("INSTITUTIONA_API_KEY"),
  },
  {
    institutionId: "InstitutionBMSP",
    displayName: "Institution B",
    email: "admin@institutionb.edu",
    password: "InstB!Portal9",
    baseUrl: "http://localhost:3003",
    apiKey: requireEnv("INSTITUTIONB_API_KEY"),
  },
];

export function findByCredentials(email: string, password: string): InstitutionAccount | undefined {
  return INSTITUTIONS.find(
    (i) => i.email.toLowerCase() === email.trim().toLowerCase() && i.password === password,
  );
}

export function findByInstitutionId(institutionId: string): InstitutionAccount | undefined {
  return INSTITUTIONS.find((i) => i.institutionId === institutionId);
}

export function displayNameFor(institutionId: string): string {
  return findByInstitutionId(institutionId)?.displayName ?? institutionId;
}
