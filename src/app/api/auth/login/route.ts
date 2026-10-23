import { NextRequest, NextResponse } from "next/server";
import { LOGIN_STATE_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_client_id`);
  }

  // Random state, checked by the callback, so a login can only complete in the browser that started it
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  // Only offer accounts from the allowed Workspace domain in Google's account picker (a hint;
  // the callback still enforces the allow-list)
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
  if (domains.length === 1) {
    params.set("hd", domains[0]);
  }

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set(LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https://"),
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
