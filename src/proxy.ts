import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Exact paths reachable without a session. Everything else (including the QuickBooks and
// Gmail connect/callback routes) requires a logged-in user, so nobody outside can link their
// own QuickBooks company or mailbox to the CRM.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login", // starts Google sign-in
  "/api/auth/callback", // Google sign-in callback
  "/api/auth/logout",
  "/api/auth/me",
  "/api/webhooks/unifi-talk", // UniFi Talk PBX (protected by its own shared secret)
]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets are excluded by the matcher below; Next.js internals are always allowed
  if (pathname.startsWith("/_next/") || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Local development/testing only: never set ENABLE_AUTH=false on a reachable deployment
  if (process.env.ENABLE_AUTH === "false") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (user) {
    return NextResponse.next();
  }

  // API calls get a 401 instead of an HTML redirect
  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Not logged in" }, { status: 401 })
    : (() => {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
      })();
  if (token) {
    res.cookies.delete(SESSION_COOKIE_NAME);
  }
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
