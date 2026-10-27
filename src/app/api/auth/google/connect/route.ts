import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthorizeUrl, GOOGLE_STATE_COOKIE } from "@/lib/google";
import { getRequestUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Starts connecting the signed-in staff member's own Google account (Gmail + Chat) with a
 * random state value, which the callback checks so a connection can only be completed from a
 * flow this browser started.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsError = (message: string) =>
    NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(message)}`);

  if (!process.env.GOOGLE_CLIENT_ID) return settingsError("Missing GOOGLE_CLIENT_ID");

  const user = await getRequestUser(req);
  if (!user) return settingsError("Sign in to TalkCRM before connecting Google.");

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildGoogleAuthorizeUrl(state, user.email));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https://"),
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
