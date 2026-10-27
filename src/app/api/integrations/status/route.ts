import { NextRequest, NextResponse } from "next/server";
import { getQboConnection, getQboAuthUrl } from "@/lib/quickbooks";
import { getGoogleAccount, hasScopes, GMAIL_SCOPE, CHAT_SCOPES } from "@/lib/google";
import { getRequestUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const qbo = await getQboConnection();
  const user = await getRequestUser(req);
  // Google is connected per staff member: report the signed-in person's own connection
  const google = user ? await getGoogleAccount(user.email) : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/unifi-talk`;

  return NextResponse.json({
    quickbooks: {
      connected: !!qbo?.accessToken,
      realmId: qbo?.realmId || null,
      lastSyncedAt: qbo?.lastSyncedAt || null,
      authUrl: getQboAuthUrl(),
      configuredInEnv: !!process.env.QBO_CLIENT_ID,
      redirectUri: `${appUrl}/api/auth/quickbooks/callback`,
    },
    google: {
      signedInAs: user?.email || null,
      connected: !!google?.refreshToken || !!google?.accessToken,
      gmail: hasScopes(google, [GMAIL_SCOPE]),
      chat: hasScopes(google, CHAT_SCOPES),
      authUrl: process.env.GOOGLE_CLIENT_ID ? "/api/auth/google/connect" : "",
      configuredInEnv: !!process.env.GOOGLE_CLIENT_ID,
      redirectUri: `${appUrl}/api/auth/google/callback`,
    },
    unifiTalk: {
      webhookUrl,
      hasSecret: !!process.env.UNIFI_TALK_WEBHOOK_SECRET,
    },
    autoSync: process.env.AUTO_SYNC !== "false",
    demoDataEnabled: process.env.ENABLE_DEMO_DATA === "true",
  });
}
