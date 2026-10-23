import { db } from "./db";
import { normalizePhoneNumber, extractDigits } from "./phone-utils";

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
// From https://developer.api.intuit.com/.well-known/openid_configuration
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_MINOR_VERSION = "75";
const QBO_PAGE_SIZE = 1000; // QuickBooks query maximum

export const QBO_STATE_COOKIE = "talkcrm_qbo_state";

function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/quickbooks/callback`;
}

export async function getQboConnection() {
  return await db.integration.findUnique({
    where: { provider: "quickbooks" },
  });
}

/**
 * URL the Settings page links to. It goes through our own connect route, which sets a
 * random OAuth state cookie before redirecting to Intuit.
 */
export function getQboAuthUrl(): string {
  if (!process.env.QBO_CLIENT_ID) {
    return "";
  }
  return "/api/auth/quickbooks/connect";
}

export function buildQboAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID || "",
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: getRedirectUri(),
    state,
  });

  return `${QBO_AUTH_URL}?${params.toString()}`;
}

async function requestQboToken(body: Record<string, string>) {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

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
    body: new URLSearchParams(body).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QuickBooks token request failed (HTTP ${response.status}): ${errorText.slice(0, 300) || response.statusText}`);
  }

  return await response.json();
}

export async function exchangeQboToken(code: string, realmId: string) {
  const data = await requestQboToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });
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

/**
 * Returns a connection with a usable access token. QuickBooks access tokens last 1 hour;
 * refresh tokens last ~100 days and rotate, so the new refresh token must be saved each time.
 */
async function getValidQboConnection() {
  const connection = await getQboConnection();
  if (!connection || !connection.accessToken || !connection.realmId) {
    throw new Error("QuickBooks is not connected.");
  }

  const expiresSoon =
    !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;
  if (!expiresSoon) {
    return connection;
  }

  if (!connection.refreshToken) {
    throw new Error("QuickBooks session expired. Please reconnect QuickBooks in Settings.");
  }

  let data: any;
  try {
    data = await requestQboToken({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    });
  } catch (err: any) {
    throw new Error(`QuickBooks session expired. Please reconnect QuickBooks in Settings. (${err.message})`);
  }

  return await db.integration.update({
    where: { provider: "quickbooks" },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || connection.refreshToken,
      tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    },
  });
}

/**
 * Runs a QuickBooks query and follows pagination until every row is returned.
 */
async function qboQueryAll(entity: string, where: string): Promise<any[]> {
  const connection = await getValidQboConnection();

  const baseUrl =
    process.env.QBO_ENVIRONMENT === "production"
      ? `https://quickbooks.api.intuit.com/v3/company/${connection.realmId}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${connection.realmId}`;

  const rows: any[] = [];
  for (let start = 1; ; start += QBO_PAGE_SIZE) {
    const query = encodeURIComponent(
      `select * from ${entity} where ${where} startposition ${start} maxresults ${QBO_PAGE_SIZE}`
    );
    const response = await fetch(`${baseUrl}/query?query=${query}&minorversion=${QBO_MINOR_VERSION}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`QuickBooks API error (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    const page = data?.QueryResponse?.[entity] || [];
    rows.push(...page);
    if (page.length < QBO_PAGE_SIZE) {
      return rows;
    }
  }
}

export async function syncQboCustomers() {
  const customers = await qboQueryAll("Customer", "Active = true");

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

  const invoiceCount = await syncQboOpenInvoices();

  return { syncedCount, invoiceCount };
}

/**
 * Caches every unpaid invoice so screen-pops and the dashboard can show open balances.
 * Invoices that are no longer unpaid are removed from the cache.
 */
async function syncQboOpenInvoices(): Promise<number> {
  const invoices = await qboQueryAll("Invoice", "Balance > '0'");

  const customers = await db.customer.findMany({
    where: { qboId: { not: null } },
    select: { id: true, qboId: true },
  });
  const customerIdByQboId = new Map(customers.map((c) => [c.qboId as string, c.id]));
  const today = new Date().toISOString().slice(0, 10);

  const keptIds: string[] = [];
  for (const inv of invoices) {
    const customerId = customerIdByQboId.get(String(inv.CustomerRef?.value));
    if (!customerId) continue; // invoice for an inactive customer

    const qboInvoiceId = `qbo-${inv.Id}`;
    const dueDate = inv.DueDate || null;
    const data = {
      docNumber: inv.DocNumber || String(inv.Id),
      totalAmount: parseFloat(inv.TotalAmt || "0"),
      balance: parseFloat(inv.Balance || "0"),
      dueDate,
      txnDate: inv.TxnDate || null,
      status: dueDate && dueDate < today ? "Overdue" : "Open",
      customerId,
    };

    await db.invoiceCache.upsert({
      where: { qboInvoiceId },
      update: data,
      create: { qboInvoiceId, ...data },
    });
    keptIds.push(qboInvoiceId);
  }

  await db.invoiceCache.deleteMany({
    where: { qboInvoiceId: { startsWith: "qbo-", notIn: keptIds } },
  });

  return keptIds.length;
}
