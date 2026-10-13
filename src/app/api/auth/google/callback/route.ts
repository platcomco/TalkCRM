import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleToken } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error || "Missing code")}`);
  }

  try {
    await exchangeGoogleToken(code);
    return NextResponse.redirect(`${appUrl}/settings?success=google_connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(err.message)}`);
  }
}
