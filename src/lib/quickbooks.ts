import { db } from "./db";
import { buildNormalizedPhones, customerPhones, linkUnmatchedCalls, parseExtraPhones, phoneMatchKeys } from "./customers";
import { formatPhoneDisplay } from "./phone-utils";
import { OPEN_ESTIMATE_STATUSES, qboEstimateUrl } from "./qbo-links";

export { qboEstimateUrl };

const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
// From https://developer.api.intuit.com/.well-known/openid_configuration
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
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

/**
 * Logs a failed Intuit response to the server log (docker logs talkcrm) with its intuit_tid,
 * the transaction id Intuit support asks for, and returns an Error that includes it too.
 */
async function qboFailure(context: string, response: Response, userMessage?: string): Promise<Error> {
  const tid = response.headers.get("intuit_tid") || "none";
  const body = (await response.text().catch(() => "")).slice(0, 500);
  console.error(`[quickbooks] ${context} failed: HTTP ${response.status} intuit_tid=${tid} ${body}`);
  const detail = userMessage || `${context} failed (HTTP ${response.status}): ${body.slice(0, 300) || response.statusText}`;
  return new Error(`${detail} [intuit_tid ${tid}]`);
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
    throw await qboFailure(`QuickBooks token request (${body.grant_type})`, response);
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
 * Disconnects QuickBooks: revokes the tokens with Intuit (revoking the refresh token also
 * revokes its access token) and removes the stored connection. The local connection is
 * removed even if Intuit can't be reached, so the app stops using QuickBooks either way.
 */
export async function disconnectQbo(): Promise<{ revoked: boolean }> {
  const connection = await getQboConnection();
  let revoked = false;

  const token = connection?.refreshToken || connection?.accessToken;
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (token && clientId && clientSecret) {
    try {
      const res = await fetch(QBO_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: JSON.stringify({ token }),
      });
      revoked = res.ok;
      if (!res.ok) await qboFailure("QuickBooks token revoke", res);
    } catch (err) {
      console.error("QuickBooks token revoke failed:", err);
    }
  }

  await db.integration.deleteMany({ where: { provider: "quickbooks" } });
  return { revoked };
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

function qboBaseUrl(realmId: string | null): string {
  return process.env.QBO_ENVIRONMENT === "production"
    ? `https://quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`;
}

/**
 * Runs a QuickBooks query and follows pagination until every row is returned.
 */
async function qboQueryAll(entity: string, where: string): Promise<any[]> {
  const connection = await getValidQboConnection();
  const baseUrl = qboBaseUrl(connection.realmId);

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

    if (response.status === 401) {
      // Token rejected even though it wasn't due to expire, e.g. the app was disconnected from
      // inside QuickBooks. Refreshing won't help; the user has to authorize again.
      throw await qboFailure(
        `QuickBooks ${entity} query`,
        response,
        "QuickBooks authorization was revoked or has expired. Please reconnect QuickBooks in Settings."
      );
    }
    if (!response.ok) {
      throw await qboFailure(`QuickBooks ${entity} query`, response);
    }

    const data = await response.json();
    const page = data?.QueryResponse?.[entity] || [];
    rows.push(...page);
    if (page.length < QBO_PAGE_SIZE) {
      return rows;
    }
  }
}

/**
 * Finds a DIRECTV account number (8-9 digits): first an explicit "Acct #12345678" in the notes,
 * then a standalone 8-9 digit number in the notes or company name. Phone numbers (10+ digits)
 * never match.
 */
export function extractAccountNumber(...sources: (string | null | undefined)[]): string | null {
  const texts = sources.filter((s): s is string => !!s);
  for (const text of texts) {
    const labeled = text.match(/\bacc(?:oun)?t\.?\s*(?:no\.?|number)?\s*#?\s*(\d{8,9})\b/i);
    if (labeled) return labeled[1];
  }
  for (const text of texts) {
    const bare = text.match(/(?<!\d)(\d{8,9})(?!\d)/);
    if (bare) return bare[1];
  }
  return null;
}

function formatQboAddress(addr: any): string | null {
  if (!addr) return null;
  const street = [addr.Line1, addr.Line2, addr.Line3, addr.Line4, addr.Line5].filter(Boolean).join(", ");
  const cityLine = [addr.City, [addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [street, cityLine].filter(Boolean).join(", ") || null;
}

/** Maps CustomerType ids to names (the Customer record only carries the id). */
async function getQboCustomerTypes(): Promise<Map<string, string>> {
  try {
    const types = await qboQueryAll("CustomerType", "Active = true");
    return new Map(types.map((t: any) => [String(t.Id), t.Name]));
  } catch (err) {
    // Client types aren't available on every QuickBooks plan; sync the rest without them
    console.error("Could not load QuickBooks client types:", err);
    return new Map();
  }
}

type QboSyncResult = {
  syncedCount: number;
  invoiceCount: number;
  estimateCount: number;
  mergedCount: number;
  linkedCalls: number;
};
let qboSyncInFlight: Promise<QboSyncResult> | null = null;

/** Syncs customers and open invoices. Overlapping calls (scheduler + Sync button) share one run. */
export function syncQboCustomers(): Promise<QboSyncResult> {
  qboSyncInFlight ??= runQboSync().finally(() => {
    qboSyncInFlight = null;
  });
  return qboSyncInFlight;
}

async function runQboSync(): Promise<QboSyncResult> {
  const customers = await qboQueryAll("Customer", "Active = true");
  const customerTypes = await getQboCustomerTypes();
  const displayNameById = new Map(customers.map((c: any) => [String(c.Id), c.DisplayName as string]));

  // Contacts created in TalkCRM (no qboId) that may since have been added in QuickBooks
  const localContacts = await db.customer.findMany({
    where: { qboId: null },
    select: { id: true, primaryPhone: true, mobilePhone: true, alternatePhone: true, extraPhones: true, email: true },
  });
  // Numbers added in TalkCRM aren't in QuickBooks, so each customer keeps its own across syncs
  const extraPhonesByQboId = new Map(
    (await db.customer.findMany({ where: { qboId: { not: null } }, select: { qboId: true, extraPhones: true } })).map(
      (c) => [c.qboId as string, c.extraPhones]
    )
  );

  let syncedCount = 0;
  let mergedCount = 0;
  for (const c of customers) {
    const primaryPhone = c.PrimaryPhone?.FreeFormNumber || null;
    const mobilePhone = c.Mobile?.FreeFormNumber || null;
    const alternatePhone = c.AlternatePhone?.FreeFormNumber || null;
    const email = c.PrimaryEmailAddr?.Address || null;
    const name = c.DisplayName || `${c.GivenName || ""} ${c.FamilyName || ""}`.trim() || "Unknown";
    const companyName = c.CompanyName || null;
    const qboBalance = parseFloat(c.Balance || "0");
    const qboNotes = c.Notes || null;
    const customerType = customerTypes.get(String(c.CustomerTypeRef?.value)) || null;
    const parentName = c.ParentRef?.value
      ? displayNameById.get(String(c.ParentRef.value)) || c.ParentRef.name || null
      : null;
    const accountNumber = extractAccountNumber(qboNotes, companyName, c.Suffix);
    const billingAddress = formatQboAddress(c.BillAddr);

    const data = {
      name,
      companyName,
      primaryPhone,
      mobilePhone,
      alternatePhone,
      email,
      billingAddress,
      qboBalance,
      qboNotes,
      customerType,
      parentName,
      accountNumber,
    };

    const qboId = String(c.Id);
    const qboPhones = new Set(phoneMatchKeys(primaryPhone, mobilePhone, alternatePhone));
    if (!extraPhonesByQboId.has(qboId)) {
      // New in QuickBooks: if someone already added this person in TalkCRM (same phone or
      // email), adopt that contact so its calls, notes and Chat threads carry over (no duplicate)
      const qboEmail = email?.trim().toLowerCase();
      const local = localContacts.find(
        (l) =>
          phoneMatchKeys(...customerPhones(l)).some((p) => qboPhones.has(p)) ||
          (!!qboEmail && l.email?.trim().toLowerCase() === qboEmail)
      );
      if (local) {
        // The contact's numbers that QuickBooks doesn't have stay as TalkCRM-only numbers
        const extraPhones = Array.from(new Set(phoneMatchKeys(...customerPhones(local))))
          .filter((p) => !qboPhones.has(p))
          .join(",");
        await db.customer.update({
          where: { id: local.id },
          data: {
            qboId,
            ...data,
            extraPhones,
            normalizedPhones: buildNormalizedPhones(...customerPhones({ ...data, extraPhones })),
          },
        });
        localContacts.splice(localContacts.indexOf(local), 1);
        extraPhonesByQboId.set(qboId, extraPhones);
        mergedCount++;
        syncedCount++;
        continue;
      }
    }

    // A TalkCRM-only number that has since been entered in QuickBooks no longer needs keeping
    const extraPhones = parseExtraPhones(extraPhonesByQboId.get(qboId))
      .filter((p) => !qboPhones.has(p))
      .join(",");
    const synced = {
      ...data,
      extraPhones,
      normalizedPhones: buildNormalizedPhones(...customerPhones({ ...data, extraPhones })),
    };
    await db.customer.upsert({
      where: { qboId },
      update: synced,
      create: { qboId, ...synced },
    });
    syncedCount++;
  }

  const invoiceCount = await syncQboOpenInvoices();
  const estimateCount = await syncQboOpenEstimates();
  const linkedCalls = await linkUnmatchedCalls();

  await db.integration.update({ where: { provider: "quickbooks" }, data: { lastSyncedAt: new Date() } });

  return { syncedCount, invoiceCount, estimateCount, mergedCount, linkedCalls };
}


export type QboEstimateSummary = {
  id: string;
  qboUrl: string;
  docNumber: string;
  txnDate: string | null;
  expirationDate: string | null;
  acceptedDate: string | null;
  totalAmount: number;
  status: string; // Pending, Accepted, Closed (invoiced), Rejected
  summary: string | null;
};

/** What an estimate is for: its first few line items (name, or description when there's no item). */
function summarizeEstimateLines(lines: any[] | undefined): string | null {
  const items = (lines || [])
    .filter((l) => l.DetailType === "SalesItemLineDetail")
    .map((l) => (l.Description || l.SalesItemLineDetail?.ItemRef?.name || "").trim().split("\n")[0])
    .filter(Boolean);
  if (items.length === 0) return null;
  const text = items.slice(0, 3).join(", ") + (items.length > 3 ? ` +${items.length - 3} more` : "");
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function toEstimateSummary(est: any): QboEstimateSummary {
  return {
    id: String(est.Id),
    qboUrl: qboEstimateUrl(String(est.Id)),
    docNumber: est.DocNumber || String(est.Id),
    txnDate: est.TxnDate || null,
    expirationDate: est.ExpirationDate || null,
    acceptedDate: est.AcceptedDate || null,
    totalAmount: parseFloat(est.TotalAmt || "0"),
    status: est.TxnStatus || "Pending",
    summary: summarizeEstimateLines(est.Line),
  };
}

/** One customer's estimates (every status), newest first, read live from QuickBooks. */
export async function getQboCustomerEstimates(qboId: string, limit = 100): Promise<QboEstimateSummary[]> {
  if (!/^\d+$/.test(qboId)) throw new Error("Invalid QuickBooks customer id");
  const estimates = await qboQueryAll("Estimate", `CustomerRef = '${qboId}' ORDERBY TxnDate DESC`);
  return estimates.slice(0, limit).map(toEstimateSummary);
}

/**
 * Caches every estimate still awaiting a decision (Pending or Accepted, however old) so callers'
 * open quotes show on the screen pop and can be reviewed with them. Others are removed.
 */
async function syncQboOpenEstimates(): Promise<number> {
  let estimates: any[];
  try {
    estimates = await qboQueryAll("Estimate", `TxnStatus IN ('Pending', 'Accepted')`);
  } catch {
    // Not every QuickBooks edition can filter on status: read them all and filter here
    estimates = (await qboQueryAll("Estimate", "TxnDate > '1900-01-01'")).filter((e: any) =>
      OPEN_ESTIMATE_STATUSES.includes(e.TxnStatus)
    );
  }

  const customers = await db.customer.findMany({
    where: { qboId: { not: null } },
    select: { id: true, qboId: true },
  });
  const customerIdByQboId = new Map(customers.map((c) => [c.qboId as string, c.id]));

  const keptIds: string[] = [];
  for (const est of estimates) {
    const customerId = customerIdByQboId.get(String(est.CustomerRef?.value));
    if (!customerId) continue; // estimate for an inactive customer

    const { id: qboEstimateId, qboUrl, ...summary } = toEstimateSummary(est);
    const data = { ...summary, customerId };
    await db.estimateCache.upsert({
      where: { qboEstimateId },
      update: data,
      create: { qboEstimateId, ...data },
    });
    keptIds.push(qboEstimateId);
  }

  await db.estimateCache.deleteMany({ where: { qboEstimateId: { notIn: keptIds } } });
  return keptIds.length;
}

export type QboInvoiceSummary = {
  id: string;
  qboUrl: string;
  docNumber: string;
  txnDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  balance: number;
  status: "Paid" | "Open" | "Overdue";
};

/**
 * One customer's invoice history (paid and unpaid), newest first, read live from QuickBooks.
 * The sync only caches unpaid invoices, so this is what shows a customer's full history.
 */
export async function getQboCustomerInvoices(qboId: string, limit = 100): Promise<QboInvoiceSummary[]> {
  if (!/^\d+$/.test(qboId)) throw new Error("Invalid QuickBooks customer id");
  const invoices = await qboQueryAll("Invoice", `CustomerRef = '${qboId}' ORDERBY TxnDate DESC`);
  const today = new Date().toISOString().slice(0, 10);

  return invoices.slice(0, limit).map((inv: any) => {
    const balance = parseFloat(inv.Balance || "0");
    const dueDate = inv.DueDate || null;
    return {
      id: String(inv.Id),
      qboUrl: `https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(String(inv.Id))}`,
      docNumber: inv.DocNumber || String(inv.Id),
      txnDate: inv.TxnDate || null,
      dueDate,
      totalAmount: parseFloat(inv.TotalAmt || "0"),
      balance,
      status: balance <= 0 ? "Paid" : dueDate && dueDate < today ? "Overdue" : "Open",
    };
  });
}

export type QboPhoneField = "PrimaryPhone" | "Mobile" | "AlternatePhone";

/**
 * Saves a phone number on a QuickBooks customer, in the first empty slot of Mobile then
 * Alternate phone (existing numbers are never overwritten). Returns the field it is in, or null
 * when every slot is already taken.
 */
export async function addQboCustomerPhone(
  qboId: string,
  phone: string
): Promise<{ field: QboPhoneField | null; alreadyThere: boolean }> {
  if (!/^\d+$/.test(qboId)) throw new Error("Invalid QuickBooks customer id");
  const [key] = phoneMatchKeys(phone);
  if (!key) throw new Error("Enter a 10-digit phone number");

  const connection = await getValidQboConnection();
  const baseUrl = qboBaseUrl(connection.realmId);
  const headers = {
    Authorization: `Bearer ${connection.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Read first: the update needs the current SyncToken, and the slots may have changed since the last sync
  const readRes = await fetch(`${baseUrl}/customer/${qboId}?minorversion=${QBO_MINOR_VERSION}`, { headers });
  if (!readRes.ok) throw await qboFailure("QuickBooks customer read", readRes);
  const customer = (await readRes.json())?.Customer;
  if (!customer) throw new Error("QuickBooks customer not found");

  const fields: QboPhoneField[] = ["PrimaryPhone", "Mobile", "AlternatePhone"];
  const existing = fields.find((f) => phoneMatchKeys(customer[f]?.FreeFormNumber)[0] === key);
  if (existing) return { field: existing, alreadyThere: true };

  const field = (["Mobile", "AlternatePhone"] as const).find((f) => !customer[f]?.FreeFormNumber?.trim());
  if (!field) return { field: null, alreadyThere: false };

  // Sparse update: only this field changes
  const writeRes = await fetch(`${baseUrl}/customer?minorversion=${QBO_MINOR_VERSION}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      Id: customer.Id,
      SyncToken: customer.SyncToken,
      sparse: true,
      [field]: { FreeFormNumber: formatPhoneDisplay(key) },
    }),
  });
  if (!writeRes.ok) throw await qboFailure("QuickBooks customer update", writeRes);
  return { field, alreadyThere: false };
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
