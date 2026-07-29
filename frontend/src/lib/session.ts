import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { findByInstitutionId, type InstitutionAccount } from "./institutions";

const SESSION_COOKIE = "blc_session";
const SESSION_TTL = "8h";

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing required env var SESSION_SECRET - see frontend/.env.local");
  }
  return new TextEncoder().encode(secret);
}

// The cookie holds a signed, expiring JWT (institutionId claim only) -
// NOT a bare institutionId string. Without signing, anyone could set
// their own `blc_session=BLCFounderMSP` cookie directly (bypassing
// login entirely) since httpOnly only stops JS from reading/editing
// it, not a request crafted outside the browser. baseUrl/displayName/
// apiKey are always re-derived server-side from lib/institutions.ts,
// never trusted from the token itself beyond the institutionId claim.
export async function setSession(institutionId: string): Promise<void> {
  const token = await new SignJWT({ institutionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(sessionSecret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Verifies the JWT's signature and expiry - returns undefined on ANY
// failure (missing cookie, expired, tampered, wrong signature) rather
// than throwing, so callers degrade to "not logged in," not a crash.
export async function getSession(): Promise<InstitutionAccount | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return undefined;

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const institutionId = payload.institutionId;
    if (typeof institutionId !== "string") return undefined;
    return findByInstitutionId(institutionId);
  } catch {
    return undefined;
  }
}

// requireSession() re-verifies independently of proxy.ts (which also
// verifies the JWT, not just cookie presence, since a 2026-07-28 fix -
// see proxy.ts's own comment for why a presence-only check caused a
// redirect loop). This duplication is intentional defense-in-depth
// per Next's own guidance not to rely on middleware as the sole
// authorization boundary - a forged or expired cookie must still be
// rejected here even if proxy.ts's check were ever weakened again.
export async function requireSession(): Promise<InstitutionAccount> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
