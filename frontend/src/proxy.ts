import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "blc_session";
const PUBLIC_PATHS = ["/login"];

// Next.js 16 renamed "middleware" to "proxy" (same functionality, new
// name/file convention) - this is intentionally proxy.ts, not
// middleware.ts. See node_modules/next/dist/docs/.../proxy.md.
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

// This DOES verify the session (not just check cookie presence) -
// a present-but-invalid cookie (forged, expired, tampered) must be
// treated as "no session" here too, not just by requireSession() in
// lib/session.ts. Without real verification here, a present-but-invalid
// cookie would pass this check at "/" (no redirect), get rejected by
// requireSession() deeper in the page (redirect to /login), then get
// bounced straight back to "/" by this same check's other branch
// (cookie present + on /login) - an infinite redirect loop, not just a
// missed rejection. Verified this failure mode live before fixing it.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const validSession = await hasValidSession(request);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path);

  if (!validSession && !isPublicPath) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (validSession && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!validSession && isPublicPath) {
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
