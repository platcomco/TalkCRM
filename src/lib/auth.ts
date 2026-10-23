import { NextRequest } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string; // Hosted domain (Google Workspace domain)
};

const SESSION_COOKIE_NAME = "talkcrm_session";
export const LOGIN_STATE_COOKIE = "talkcrm_login_state";

/**
 * The session signing secret. There is deliberately no fallback: a default secret would be
 * public in the source code and let anyone forge a session. Without a strong secret, no
 * session can be created or verified, so nobody can log in (fail closed).
 */
function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

export function isAuthConfigured(): boolean {
  return getAuthSecret() !== null;
}

/**
 * Creates an HMAC-SHA256 signed session token.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is not set (needs at least 32 characters).");
  }

  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const b64Payload = Buffer.from(payload).toString("base64url");
  const b64Sig = Buffer.from(signature).toString("base64url");

  return `${b64Payload}.${b64Sig}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  const secret = getAuthSecret();
  if (!secret || !token || !token.includes(".")) return null;

  try {
    const [b64Payload, b64Sig] = token.split(".");
    const payload = Buffer.from(b64Payload, "base64url").toString();
    const signature = Buffer.from(b64Sig, "base64url");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const isValid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(payload));
    if (!isValid) return null;

    const data = JSON.parse(payload);
    if (data.exp && data.exp < Date.now()) {
      return null; // Expired
    }

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
      hd: data.hd,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Checks if a Google account may log in. Fails closed: with no ALLOWED_EMAIL_DOMAINS or
 * ALLOWED_USERS configured, nobody is allowed.
 * - Domains only match Google's `hd` claim, which Google sets solely for accounts managed by
 *   that Google Workspace (a personal Google account can't claim it).
 * - Individual addresses must be verified by Google.
 */
export function isEmailAllowed(email: string, hd?: string, emailVerified?: boolean): boolean {
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const allowedEmails = (process.env.ALLOWED_USERS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!email || emailVerified !== true) {
    return false;
  }

  if (allowedEmails.includes(email.toLowerCase())) {
    return true;
  }

  return !!hd && allowedDomains.includes(hd.toLowerCase());
}

export function getSessionFromCookies(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export { SESSION_COOKIE_NAME };
