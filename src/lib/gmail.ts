import { db } from "./db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function getGoogleConnection() {
  return await db.integration.findUnique({
    where: { provider: "google" },
  });
}

export const GOOGLE_STATE_COOKIE = "talkcrm_google_state";

/**
 * URL the Settings page links to. It goes through our own connect route, which sets a
 * random OAuth state cookie before redirecting to Google.
 */
export function getGoogleAuthUrl(): string {
  if (!process.env.GOOGLE_CLIENT_ID) return "";
  return "/api/auth/google/connect";
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;
  const scope = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleToken(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token exchange error: ${errorText}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  return await db.integration.upsert({
    where: { provider: "google" },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || undefined,
      tokenExpiresAt: expiresAt,
      metadata: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
    create: {
      provider: "google",
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      tokenExpiresAt: expiresAt,
      metadata: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
  });
}

export type EmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
};

export async function fetchCustomerEmailThreads(email: string): Promise<EmailMessage[]> {
  if (!email) return [];

  const connection = await getGoogleConnection();
  if (!connection || !connection.accessToken) {
    return [];
  }

  try {
    const q = encodeURIComponent(`from:${email} OR to:${email}`);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`,
      {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      }
    );

    if (!listRes.ok) {
      return [];
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    const results: EmailMessage[] = [];
    for (const item of messages.slice(0, 8)) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        }
      );
      if (msgRes.ok) {
        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "No Subject";
        const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
        const to = headers.find((h: any) => h.name.toLowerCase() === "to")?.value || "";
        const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

        results.push({
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          to,
          date,
          snippet: msg.snippet || "",
        });
      }
    }

    return results;
  } catch (err) {
    console.error("Error fetching emails for customer:", err);
    return [];
  }
}
