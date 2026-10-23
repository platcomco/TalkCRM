import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  isEmailAllowed,
  LOGIN_STATE_COOKIE,
  SESSION_COOKIE_NAME,
  SessionUser,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/callback`;

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error || "access_denied")}`);
  }

  const expectedState = req.cookies.get(LOGIN_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  if (!isAuthConfigured()) {
    return NextResponse.redirect(`${appUrl}/login?error=auth_not_configured`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_credentials`);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Google token exchange error:", errText);
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();

    // 2. Fetch user profile from Google UserInfo endpoint
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${appUrl}/login?error=userinfo_failed`);
    }

    const googleUser = await userRes.json();
    const { sub, email, name, picture, hd, email_verified } = googleUser;

    // 3. Verify domain or email allow-list
    if (!isEmailAllowed(email, hd, email_verified === true || email_verified === "true")) {
      return NextResponse.redirect(
        `${appUrl}/login?error=unauthorized_domain&email=${encodeURIComponent(email)}`
      );
    }

    const sessionUser: SessionUser = {
      id: sub,
      email,
      name: name || email,
      picture: picture || undefined,
      hd: hd || undefined,
    };

    // 4. Create signed session token and set HTTP-only cookie
    const token = await createSessionToken(sessionUser);

    const response = NextResponse.redirect(`${appUrl}/`);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    response.cookies.delete({ name: LOGIN_STATE_COOKIE, path: "/api/auth" });

    return response;
  } catch (err: any) {
    console.error("Login callback error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(err.message)}`);
  }
}
