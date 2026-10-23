import { NextResponse } from "next/server";
import { getQboConnection, getQboAuthUrl } from "@/lib/quickbooks";
import { getGoogleConnection, getGoogleAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const qbo = await getQboConnection();
  const google = await getGoogleConnection();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/unifi-talk`;

  return NextResponse.json({
    quickbooks: {
      connected: !!qbo?.accessToken,
      realmId: qbo?.realmId || null,
      authUrl: getQboAuthUrl(),
      configuredInEnv: !!process.env.QBO_CLIENT_ID,
      redirectUri: `${appUrl}/api/auth/quickbooks/callback`,
    },
    google: {
      connected: !!google?.accessToken,
      authUrl: getGoogleAuthUrl(),
      configuredInEnv: !!process.env.GOOGLE_CLIENT_ID,
      redirectUri: `${appUrl}/api/auth/google/callback`,
    },
    unifiTalk: {
      webhookUrl,
      hasSecret: !!process.env.UNIFI_TALK_WEBHOOK_SECRET,
    },
    demoDataEnabled: process.env.ENABLE_DEMO_DATA === "true",
  });
}
