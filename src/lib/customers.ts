import { db } from "./db";
import { extractDigits, normalizePhoneNumber } from "./phone-utils";

/** Comma-separated digits + E.164 forms of a customer's phones, used for caller matching. */
export function buildNormalizedPhones(...phones: (string | null | undefined)[]): string {
  const digits = phones.map((p) => extractDigits(p || "")).filter(Boolean);
  return [...digits, ...digits.map((d) => normalizePhoneNumber(d))].join(",");
}

/** The 10-digit national numbers in a customer's phone fields (what call matching compares). */
export function phoneMatchKeys(...phones: (string | null | undefined)[]): string[] {
  return phones
    .map((p) => extractDigits(p || ""))
    .filter((d) => d.length >= 10)
    .map((d) => d.slice(-10));
}

/** The TalkCRM-only numbers stored in Customer.extraPhones. */
export function parseExtraPhones(extraPhones: string | null | undefined): string[] {
  return (extraPhones || "").split(",").filter(Boolean);
}

type CustomerPhones = {
  primaryPhone?: string | null;
  mobilePhone?: string | null;
  alternatePhone?: string | null;
  extraPhones?: string | null;
};

/** Every phone a customer can be matched on: QuickBooks' numbers plus numbers added in TalkCRM. */
export function customerPhones(c: CustomerPhones): (string | null | undefined)[] {
  return [c.primaryPhone, c.mobilePhone, c.alternatePhone, ...parseExtraPhones(c.extraPhones)];
}

/**
 * Moves every call from this phone number to the customer, even calls that were matched to
 * another customer sharing the number. Used when someone creates a contact for a caller.
 */
export async function assignCallsFromNumber(phone: string, customerId: string): Promise<number> {
  const [key] = phoneMatchKeys(phone);
  if (!key) return 0;
  const result = await db.callLog.updateMany({
    where: { normalizedFrom: { endsWith: key } },
    data: { customerId },
  });
  return result.count;
}

/**
 * Attaches calls that came in before anyone knew who the caller was (e.g. a contact added
 * after the call) to the customer whose phone now matches. Returns how many calls were linked.
 */
export async function linkUnmatchedCalls(): Promise<number> {
  const calls = await db.callLog.findMany({
    where: { customerId: null },
    select: { id: true, normalizedFrom: true },
  });
  if (calls.length === 0) return 0;

  const customers = await db.customer.findMany({
    select: {
      id: true,
      primaryPhone: true,
      mobilePhone: true,
      alternatePhone: true,
      extraPhones: true,
      parentName: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
  // Same preference as the webhook: a top-level account over a QuickBooks sub-client
  const customerByPhone = new Map<string, { id: string; parentName: string | null }>();
  for (const c of customers) {
    for (const key of phoneMatchKeys(...customerPhones(c))) {
      const existing = customerByPhone.get(key);
      if (!existing || (existing.parentName && !c.parentName)) customerByPhone.set(key, c);
    }
  }

  let linked = 0;
  for (const call of calls) {
    const digits = extractDigits(call.normalizedFrom);
    if (digits.length < 10) continue;
    const match = customerByPhone.get(digits.slice(-10));
    if (!match) continue;
    await db.callLog.update({ where: { id: call.id }, data: { customerId: match.id } });
    linked++;
  }
  return linked;
}
