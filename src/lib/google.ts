import { db } from "./db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const GOOGLE_STATE_COOKIE = "talkcrm_google_state";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CHAT_SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
];
const REQUESTED_SCOPES = ["openid", "email", GMAIL_SCOPE, ...CHAT_SCOPES];

export type GoogleAccount = NonNullable<Awaited<ReturnType<typeof getGoogleAccount>>>;

/** Thrown when a stored Google authorization is gone and its owner must reconnect. */
export class GoogleAuthError extends Error {}

function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;
}

export async function getGoogleAccount(email: string) {
  return await db.googleAccount.findUnique({ where: { email: email.toLowerCase() } });
}

export function hasScopes(account: { scopes: string } | null, scopes: string[]): boolean {
  if (!account) return false;
  const granted = new Set(account.scopes.split(" "));
  return scopes.every((s) => granted.has(s));
}

/**
 * Google's consent URL for one staff member. login_hint pre-selects their account; the callback
 * still checks that the account they chose is the one they're signed in to TalkCRM with.
 */
export function buildGoogleAuthorizeUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: REQUESTED_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    // Always show consent so Google issues a refresh token, even on a reconnect
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function getClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
  }
  return { clientId, clientSecret };
}

/** The email inside Google's ID token. It comes straight from Google's token endpoint over TLS, so no signature check is needed. */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload.email_verified ? String(payload.email).toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Completes the connect flow for the signed-in staff member and stores their tokens.
 * Refuses a different Google account than the one they signed in with, so each person's
 * connection is really their own mailbox.
 */
export async function exchangeGoogleToken(code: string, sessionEmail: string) {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 500);
    console.error(`[google] token exchange failed: HTTP ${response.status} ${body}`);
    throw new Error(`Google token exchange failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const email = emailFromIdToken(data.id_token);
  if (!email || email !== sessionEmail.toLowerCase()) {
    throw new Error(
      `You chose ${email || "a different Google account"}, but you're signed in to TalkCRM as ${sessionEmail}. Connect with ${sessionEmail}.`
    );
  }

  const fields = {
    accessToken: data.access_token,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scopes: data.scope || "",
  };
  return await db.googleAccount.upsert({
    where: { email },
    // Google omits the refresh token when it already issued one; keep the stored one then
    update: { ...fields, ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}) },
    create: { email, ...fields, refreshToken: data.refresh_token || null },
  });
}

/** Exchanges the stored refresh token for a new access token (they last ~1 hour) and saves it. */
async function refreshGoogleAccessToken(account: GoogleAccount): Promise<GoogleAccount> {
  const { clientId, clientSecret } = getClientCredentials();
  if (!account.refreshToken) {
    throw new GoogleAuthError("Google connection expired. Please reconnect Google in Settings.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 500);
    console.error(`[google] token refresh for ${account.email} failed: HTTP ${response.status} ${body}`);
    // 400 invalid_grant: the refresh token was revoked, or the account's password changed
    if (response.status === 400 || response.status === 401) {
      throw new GoogleAuthError("Google connection expired or was revoked. Please reconnect Google in Settings.");
    }
    throw new Error(`Google token refresh failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  return await db.googleAccount.update({
    where: { email: account.email },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      ...(data.scope ? { scopes: data.scope } : {}),
    },
  });
}

/**
 * Returns the staff member's account with a usable access token, refreshing it first when it
 * is missing or about to expire. Returns null when they have never connected Google.
 */
async function getValidGoogleAccount(email: string): Promise<GoogleAccount | null> {
  const account = await getGoogleAccount(email);
  if (!account || (!account.accessToken && !account.refreshToken)) return null;

  const expiresSoon =
    !account.accessToken ||
    !account.tokenExpiresAt ||
    account.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  return expiresSoon ? await refreshGoogleAccessToken(account) : account;
}

/**
 * A GET-only API client acting as one staff member: refreshes their token as needed and, on a
 * 401, refreshes once and retries. Returns null when they have never connected Google.
 */
export async function getGoogleClient(email: string) {
  let account = await getValidGoogleAccount(email);
  if (!account) return null;

  return {
    account,
    async get(url: string): Promise<Response> {
      const doFetch = () => fetch(url, { headers: { Authorization: `Bearer ${account!.accessToken}` } });
      let res = await doFetch();
      if (res.status === 401) {
        console.warn(`[google] access token for ${account!.email} rejected (401); refreshing and retrying once`);
        account = await refreshGoogleAccessToken(account!);
        res = await doFetch();
        if (res.status === 401) {
          throw new GoogleAuthError("Google rejected the connection. Please reconnect Google in Settings.");
        }
      }
      return res;
    },
  };
}

/** Revokes the staff member's Google authorization and forgets their tokens. */
export async function disconnectGoogle(email: string) {
  const account = await getGoogleAccount(email);
  if (!account) return;

  const token = account.refreshToken || account.accessToken;
  if (token) {
    const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(
      () => null
    );
    if (!res?.ok) console.warn(`[google] token revoke for ${email} failed (HTTP ${res?.status ?? "network"}); deleting it anyway`);
  }
  await db.googleAccount.delete({ where: { email: account.email } });
}
