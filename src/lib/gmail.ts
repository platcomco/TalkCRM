import { db } from "./db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";
const MAX_EMAILS = 8;
const MAX_ADDRESSES = 5;

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

type GoogleConnection = NonNullable<Awaited<ReturnType<typeof getGoogleConnection>>>;

/** The stored Google authorization can no longer be used; the user must reconnect in Settings. */
class GoogleAuthError extends Error {}

/**
 * Exchanges the stored refresh token for a new access token and saves it.
 * Google access tokens only last ~1 hour. Google normally does not return a new refresh
 * token on refresh, so the stored one is kept unless a new one is provided.
 */
async function refreshGoogleAccessToken(connection: GoogleConnection): Promise<GoogleConnection> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
  }
  if (!connection.refreshToken) {
    throw new GoogleAuthError(
      "Google session expired and no refresh token is stored. Please reconnect Google in Settings."
    );
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 500);
    console.error(`[gmail] token refresh failed: HTTP ${response.status} ${body}`);
    // 400 invalid_grant: the refresh token was revoked, expired (7-day limit when the OAuth
    // consent screen is in "Testing" mode), or the account password changed.
    if (response.status === 400 || response.status === 401) {
      throw new GoogleAuthError(
        "Google authorization expired or was revoked. Please reconnect Google in Settings."
      );
    }
    throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  return await db.integration.update({
    where: { provider: "google" },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    },
  });
}

/**
 * Returns a connection with a usable access token, refreshing it when it is missing or
 * about to expire. Returns null when Google has never been connected.
 */
async function getValidGoogleConnection(): Promise<GoogleConnection | null> {
  const connection = await getGoogleConnection();
  if (!connection || (!connection.accessToken && !connection.refreshToken)) {
    return null;
  }

  const expiresSoon =
    !connection.accessToken ||
    !connection.tokenExpiresAt ||
    connection.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  return expiresSoon ? await refreshGoogleAccessToken(connection) : connection;
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

export type EmailLookupStatus =
  | "ok" // lookup worked (the list may still be empty if there is no matching mail)
  | "not_connected" // Google has never been connected
  | "expired" // connected before, but authorization expired/revoked: reconnect needed
  | "error"; // something else went wrong; see `message` and the server log

export type EmailLookupResult = {
  emails: EmailMessage[];
  status: EmailLookupStatus;
  message?: string;
};

/**
 * Customer email fields can hold several addresses ("a@x.com, b@x.com") or a display form
 * ("Name <a@x.com>"). Returns the distinct, valid addresses found.
 */
export function parseEmailAddresses(value: string | null | undefined): string[] {
  if (!value) return [];
  const candidates = value.replace(/[<>"]/g, " ").split(/[,;\s]+/);
  const valid = candidates
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(c));
  return Array.from(new Set(valid)).slice(0, MAX_ADDRESSES);
}

/**
 * Looks up recent Gmail messages to/from/cc a customer in the connected mailbox.
 * Never throws: failures are logged and reported through `status` so the UI can explain them.
 */
export async function fetchCustomerEmails(
  customerEmail: string | null | undefined
): Promise<EmailLookupResult> {
  if (!customerEmail) return { emails: [], status: "ok" };

  const addresses = parseEmailAddresses(customerEmail);
  if (addresses.length === 0) {
    return {
      emails: [],
      status: "error",
      message: `Could not find a valid email address in "${customerEmail}".`,
    };
  }

  try {
    let connection = await getValidGoogleConnection();
    if (!connection) {
      return { emails: [], status: "not_connected" };
    }

    // GET against the Gmail API. On a 401 (token rejected even though it looked valid) it
    // forces one refresh and retries before giving up.
    const gmailGet = async (path: string): Promise<Response> => {
      const send = (conn: GoogleConnection) =>
        fetch(`${GMAIL_API_URL}${path}`, { headers: { Authorization: `Bearer ${conn.accessToken}` } });

      let res = await send(connection!);
      if (res.status === 401) {
        console.warn("[gmail] access token rejected (401); refreshing and retrying once");
        connection = await refreshGoogleAccessToken(connection!);
        res = await send(connection);
        if (res.status === 401) {
          throw new GoogleAuthError("Google rejected the stored credentials. Please reconnect Google in Settings.");
        }
      }
      return res;
    };

    const q = addresses.map((a) => `(from:${a} OR to:${a} OR cc:${a})`).join(" OR ");
    const listParams = new URLSearchParams({ q, maxResults: String(MAX_EMAILS) });
    const listRes = await gmailGet(`/users/me/messages?${listParams.toString()}`);

    if (!listRes.ok) {
      const body = (await listRes.text().catch(() => "")).slice(0, 500);
      console.error(`[gmail] messages.list failed: HTTP ${listRes.status} ${body}`);
      let message = `Gmail lookup failed (HTTP ${listRes.status}).`;
      if (listRes.status === 403) {
        message =
          "Google denied access to Gmail. Check that the Gmail API is enabled in your Google Cloud project and that the gmail.readonly permission was granted (try reconnecting).";
      } else if (listRes.status === 429) {
        message = "Gmail rate limit reached. Try again in a minute.";
      }
      return { emails: [], status: "error", message };
    }

    const listData = await listRes.json();
    const messages: { id: string }[] = (listData.messages || []).slice(0, MAX_EMAILS);

    const metaParams = new URLSearchParams({ format: "metadata" });
    for (const h of ["Subject", "From", "To", "Date"]) metaParams.append("metadataHeaders", h);

    const fetched = await Promise.all(
      messages.map(async (item): Promise<EmailMessage | null> => {
        const msgRes = await gmailGet(`/users/me/messages/${item.id}?${metaParams.toString()}`);
        if (!msgRes.ok) {
          console.error(`[gmail] messages.get ${item.id} failed: HTTP ${msgRes.status}`);
          return null;
        }
        const msg = await msgRes.json();
        const headers: any[] = msg.payload?.headers || [];
        const header = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name)?.value || "";

        return {
          id: msg.id,
          threadId: msg.threadId,
          subject: header("subject") || "No Subject",
          from: header("from"),
          to: header("to"),
          date: header("date"),
          snippet: msg.snippet || "",
        };
      })
    );

    return { emails: fetched.filter((m): m is EmailMessage => m !== null), status: "ok" };
  } catch (err: any) {
    if (err instanceof GoogleAuthError) {
      return { emails: [], status: "expired", message: err.message };
    }
    console.error("[gmail] Error fetching emails for customer:", err);
    return { emails: [], status: "error", message: err?.message || "Unexpected error while contacting Gmail." };
  }
}

/**
 * Backwards-compatible wrapper that returns only the messages. Prefer fetchCustomerEmails(),
 * which also reports why a lookup came back empty.
 */
export async function fetchCustomerEmailThreads(email: string): Promise<EmailMessage[]> {
  return (await fetchCustomerEmails(email)).emails;
}
