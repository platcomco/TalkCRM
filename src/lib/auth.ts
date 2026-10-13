import { NextRequest } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string; // Hosted domain (Google Workspace domain)
};

const SESSION_COOKIE_NAME = "talkcrm_session";
const AUTH_SECRET = process.env.AUTH_SECRET || "talkcrm-default-auth-secret-change-in-prod-12345";

/**
 * Creates an HMAC-SHA256 signed session token.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(AUTH_SECRET),
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
  if (!token || !token.includes(".")) return null;

  try {
    const [b64Payload, b64Sig] = token.split(".");
    const payload = Buffer.from(b64Payload, "base64url").toString();
    const signature = Buffer.from(b64Sig, "base64url");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(AUTH_SECRET),
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
 * Checks if the email or Google Workspace domain is permitted to login.
 */
export function isEmailAllowed(email: string, hd?: string): boolean {
  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const allowedEmails = (process.env.ALLOWED_USERS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // If no restrictions are configured, allow any authenticated Google user
  if (allowedDomains.length === 0 && allowedEmails.length === 0) {
    return true;
  }

  const userEmail = email.toLowerCase();
  if (allowedEmails.includes(userEmail)) {
    return true;
  }

  const userDomain = hd?.toLowerCase() || userEmail.split("@")[1];
  if (userDomain && allowedDomains.includes(userDomain)) {
    return true;
  }

  return false;
}

export function getSessionFromCookies(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export { SESSION_COOKIE_NAME };
