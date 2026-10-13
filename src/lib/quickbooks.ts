import { db } from "./db";
import { normalizePhoneNumber, extractDigits } from "./phone-utils";

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth/v1/tokens/bearer";

export async function getQboConnection() {
  return await db.integration.findUnique({
    where: { provider: "quickbooks" },
  });
}

export function getQboAuthUrl(): string {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/quickbooks/callback`;
  const scope = "com.intuit.quickbooks.accounting";
  const state = "talkcrm_qbo_state";

  if (!clientId) {
    return "";
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope,
    redirect_uri: redirectUri,
    state,
  });

  return `${QBO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeQboToken(code: string, realmId: string) {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/quickbooks/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET in environment.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange QBO code: ${errorText}`);
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  return await db.integration.upsert({
    where: { provider: "quickbooks" },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiresAt,
      realmId,
      metadata: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
    create: {
      provider: "quickbooks",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: expiresAt,
      realmId,
      metadata: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
  });
}

export async function syncQboCustomers() {
  const connection = await getQboConnection();
  if (!connection || !connection.accessToken || !connection.realmId) {
    throw new Error("QuickBooks is not connected.");
  }

  const baseUrl =
    process.env.QBO_ENVIRONMENT === "production"
      ? `https://quickbooks.api.intuit.com/v3/company/${connection.realmId}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.realmId}`;

  const query = encodeURIComponent("select * from Customer where Active = true maxresults 200");
  const response = await fetch(`${baseUrl}/query?query=${query}`, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`QuickBooks API error: ${response.statusText}`);
  }

  const data = await response.json();
  const customers = data?.QueryResponse?.Customer || [];

  let syncedCount = 0;
  for (const c of customers) {
    const primaryPhone = c.PrimaryPhone?.FreeFormNumber || null;
    const mobilePhone = c.Mobile?.FreeFormNumber || null;
    const email = c.PrimaryEmailAddr?.Address || null;
    const name = c.DisplayName || `${c.GivenName || ""} ${c.FamilyName || ""}`.trim() || "Unknown";
    const companyName = c.CompanyName || null;
    const qboBalance = parseFloat(c.Balance || "0");

    const phoneDigits = [extractDigits(primaryPhone || ""), extractDigits(mobilePhone || "")].filter(Boolean);
    const normalizedList = [
      ...phoneDigits,
      ...phoneDigits.map((d) => normalizePhoneNumber(d)),
    ].join(",");

    await db.customer.upsert({
      where: { qboId: String(c.Id) },
      update: {
        name,
        companyName,
        primaryPhone,
        mobilePhone,
        normalizedPhones: normalizedList,
        email,
        qboBalance,
      },
      create: {
        qboId: String(c.Id),
        name,
        companyName,
        primaryPhone,
        mobilePhone,
        normalizedPhones: normalizedList,
        email,
        qboBalance,
      },
    });
    syncedCount++;
  }

  return { syncedCount };
}
