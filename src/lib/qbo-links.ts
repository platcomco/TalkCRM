// QuickBooks Online web links (safe to use in client components)

export function qboEstimateUrl(qboEstimateId: string): string {
  return `https://app.qbo.intuit.com/app/estimate?txnId=${encodeURIComponent(qboEstimateId)}`;
}

/** A Pending estimate past its expiration date: worth reviewing with the customer or closing out. */
export function isEstimateExpired(status: string, expirationDate: string | null | undefined): boolean {
  return status === "Pending" && !!expirationDate && expirationDate < new Date().toISOString().slice(0, 10);
}

/** Estimate statuses still awaiting a decision (the rest are Closed/invoiced or Rejected). */
export const OPEN_ESTIMATE_STATUSES = ["Pending", "Accepted"];
