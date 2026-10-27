import { db } from "./db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";

export async function getGoogleConnection() {
  return await db.integration.findUnique({
    where: { provider: "google" },
  });
}

type GoogleConnection = NonNullable<Awaited<ReturnType<typeof getGoogleConnection>>>;

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

/** Thrown when the stored Google authorization is gone and the user must reconnect. */
class GoogleAuthError extends Error {}

/**
 * Exchanges the stored refresh token for a new access token (they last ~1 hour) and saves it.
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
    // 400 invalid_grant: the refresh token was revoked, expired (7-day limit while the OAuth
    // consent screen is in "Testing" mode), or the account password changed.
    if (response.status === 400 || response.status === 401) {
      throw new GoogleAuthError("Google connection expired or was revoked. Please reconnect Google in Settings.");
    }
    throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  return await db.integration.update({
    where: { provider: "google" },
    data: {
      accessToken: data.access_token,
      // Google normally does not return a new refresh token; keep the existing one
      refreshToken: data.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    },
  });
}

/**
 * Returns a connection with a usable access token, refreshing it first when it is missing,
 * expired, or about to expire. Returns null when Google has never been connected.
 */
async function getValidGoogleConnection(): Promise<GoogleConnection | null> {
  const connection = await getGoogleConnection();
  if (!connection || (!connection.accessToken && !connection.refreshToken)) return null;

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

export type EmailLookupStatus = "ok" | "not_connected" | "expired" | "error";

export type EmailLookupResult = {
  emails: EmailMessage[];
  status: EmailLookupStatus;
  message?: string;
};

const EMAIL_PATTERN = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * QuickBooks can hold several addresses in one field ("a@x.com, b@x.com") or include display
 * names ("Bob <b@x.com>"). Pulls out each valid address so the Gmail query is well-formed.
 */
function parseEmailAddresses(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .replace(/[<>"]/g, " ")
    .split(/[,;\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => EMAIL_PATTERN.test(p));
  return Array.from(new Set(parts)).slice(0, 5);
}

function describeGmailFailure(status: number): string {
  if (status === 403) {
    return "Gmail refused access (HTTP 403). Check that the Gmail API is enabled in Google Cloud and that the gmail.readonly permission was granted; reconnecting Google in Settings may fix it.";
  }
  if (status === 429) {
    return "Gmail rate limit reached (HTTP 429). Try again in a minute.";
  }
  return `Gmail request failed (HTTP ${status}). See the server log for details.`;
}

/**
 * Looks up recent Gmail messages to/from/cc the customer and reports WHY there are none when
 * that happens (not connected, expired, or an error). Never throws.
 */
export async function fetchCustomerEmails(
  customerEmail: string | null | undefined
): Promise<EmailLookupResult> {
  const addresses = parseEmailAddresses(customerEmail);
  if (addresses.length === 0) {
    if (customerEmail) {
      console.warn(`[gmail] no valid email address found in customer email field: "${customerEmail}"`);
      return {
        emails: [],
        status: "error",
        message: `Could not find a valid email address in "${customerEmail}".`,
      };
    }
    return { emails: [], status: "ok" };
  }

  try {
    let connection = await getValidGoogleConnection();
    if (!connection) return { emails: [], status: "not_connected" };

    // GET against the Gmail API; on a 401 refresh the token once and retry.
    const gmailGet = async (path: string): Promise<Response> => {
      const doFetch = () =>
        fetch(`${GMAIL_API_URL}${path}`, {
          headers: { Authorization: `Bearer ${connection!.accessToken}` },
        });

      let res = await doFetch();
      if (res.status === 401) {
        console.warn("[gmail] access token rejected (401); refreshing and retrying once");
        connection = await refreshGoogleAccessToken(connection!);
        res = await doFetch();
        if (res.status === 401) {
          throw new GoogleAuthError("Google rejected the connection. Please reconnect Google in Settings.");
        }
      }
      return res;
    };

    const query = addresses.map((a) => `(from:${a} OR to:${a} OR cc:${a})`).join(" OR ");
    const listParams = new URLSearchParams({ q: query, maxResults: "8" });
    const listRes = await gmailGet(`/users/me/messages?${listParams.toString()}`);

    if (!listRes.ok) {
      const body = (await listRes.text().catch(() => "")).slice(0, 500);
      console.error(`[gmail] messages.list failed: HTTP ${listRes.status} ${body}`);
      return { emails: [], status: "error", message: describeGmailFailure(listRes.status) };
    }

    const listData = await listRes.json();
    const items: { id: string }[] = listData.messages || [];

    const fetched = await Promise.all(
      items.map(async (item): Promise<EmailMessage | null> => {
        const metaParams = new URLSearchParams({ format: "metadata" });
        for (const h of ["Subject", "From", "To", "Date"]) metaParams.append("metadataHeaders", h);

        const msgRes = await gmailGet(`/users/me/messages/${item.id}?${metaParams.toString()}`);
        if (!msgRes.ok) {
          const body = (await msgRes.text().catch(() => "")).slice(0, 300);
          console.error(`[gmail] messages.get ${item.id} failed: HTTP ${msgRes.status} ${body}`);
          return null;
        }

        const msg = await msgRes.json();
        const headers: { name?: string; value?: string }[] = msg.payload?.headers || [];
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

    return {
      emails: fetched.filter((m): m is EmailMessage => m !== null),
      status: "ok",
    };
  } catch (err: any) {
    if (err instanceof GoogleAuthError) {
      return { emails: [], status: "expired", message: err.message };
    }
    console.error("[gmail] error fetching emails for customer:", err);
    return {
      emails: [],
      status: "error",
      message: err?.message || "Unexpected error while contacting Gmail.",
    };
  }
}

/**
 * Backwards-compatible wrapper that returns only the messages. Prefer fetchCustomerEmails,
 * which also reports why a lookup came back empty.
 */
export async function fetchCustomerEmailThreads(email: string): Promise<EmailMessage[]> {
  return (await fetchCustomerEmails(email)).emails;
}
