import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleToken, GOOGLE_STATE_COOKIE } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error || "Missing code")}`);
  }

  const expectedState = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${appUrl}/settings?error=${encodeURIComponent("Gmail connection could not be verified. Please try Connect again.")}`
    );
  }

  try {
    await exchangeGoogleToken(code);
    const res = NextResponse.redirect(`${appUrl}/settings?success=google_connected`);
    res.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    return res;
  } catch (err: any) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(err.message)}`);
  }
}
