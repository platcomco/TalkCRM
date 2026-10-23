import { NextResponse } from "next/server";
import { buildGoogleAuthorizeUrl, GOOGLE_STATE_COOKIE } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/**
 * Starts the Gmail connection flow with a random state value, which the callback checks
 * so a connection can only be completed from a flow this browser started.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent("Missing GOOGLE_CLIENT_ID")}`);
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildGoogleAuthorizeUrl(state));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https://"),
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
