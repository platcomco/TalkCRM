import { NextRequest, NextResponse } from "next/server";
import { exchangeQboToken, QBO_STATE_COOKIE } from "@/lib/quickbooks";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const realmId = req.nextUrl.searchParams.get("realmId");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code || !realmId) {
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(error || "Missing code/realmId")}`);
  }

  const expectedState = req.cookies.get(QBO_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      `${appUrl}/settings?error=${encodeURIComponent("QuickBooks connection could not be verified. Please try Connect again.")}`
    );
  }

  try {
    await exchangeQboToken(code, realmId);
    const res = NextResponse.redirect(`${appUrl}/settings?success=quickbooks_connected`);
    res.cookies.delete({ name: QBO_STATE_COOKIE, path: "/api/auth/quickbooks" });
    return res;
  } catch (err: any) {
    console.error("[quickbooks] connect failed:", err);
    return NextResponse.redirect(`${appUrl}/settings?error=${encodeURIComponent(err.message)}`);
  }
}
