import { NextResponse } from "next/server";
import { buildQboAuthorizeUrl, QBO_STATE_COOKIE } from "@/lib/quickbooks";

export const dynamic = "force-dynamic";

/**
 * Starts the QuickBooks OAuth flow with a random state value, which the callback checks
 * so a connection can only be completed from a flow this browser started.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!process.env.QBO_CLIENT_ID) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent("Missing QBO_CLIENT_ID")}`);
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildQboAuthorizeUrl(state));
  res.cookies.set(QBO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https://"),
    path: "/api/auth/quickbooks",
    maxAge: 600,
  });
  return res;
}
