import { getGoogleClient, GoogleAuthError, hasScopes, GMAIL_SCOPE } from "./google";

const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";

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
 * Looks up recent messages to/from/cc the customer in the signed-in staff member's own mailbox,
 * and reports WHY there are none when that happens (not connected, expired, or an error).
 * Never throws.
 */
export async function fetchCustomerEmails(
  customerEmail: string | null | undefined,
  userEmail: string | null | undefined
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
  if (!userEmail) return { emails: [], status: "not_connected" };

  try {
    const google = await getGoogleClient(userEmail);
    if (!google || !hasScopes(google.account, [GMAIL_SCOPE])) return { emails: [], status: "not_connected" };

    const query = addresses.map((a) => `(from:${a} OR to:${a} OR cc:${a})`).join(" OR ");
    const listParams = new URLSearchParams({ q: query, maxResults: "8" });
    const listRes = await google.get(`${GMAIL_API_URL}/users/me/messages?${listParams.toString()}`);

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

        const msgRes = await google.get(`${GMAIL_API_URL}/users/me/messages/${item.id}?${metaParams.toString()}`);
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
