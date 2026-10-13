import { NextRequest, NextResponse } from "next/server";
import { exchangeQboToken } from "@/lib/quickbooks";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const realmId = req.nextUrl.searchParams.get("realmId");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !realmId) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error || "Missing code/realmId")}`);
  }

  try {
    await exchangeQboToken(code, realmId);
    return NextResponse.redirect(`${appUrl}/settings?success=quickbooks_connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(err.message)}`);
  }
}
