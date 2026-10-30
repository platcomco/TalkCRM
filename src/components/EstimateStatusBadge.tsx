import { isEstimateExpired } from "@/lib/qbo-links";

const STYLES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800",
  Accepted: "bg-emerald-100 text-emerald-800",
  Expired: "bg-rose-100 text-rose-800",
};

/** QuickBooks estimate status; a Pending estimate past its expiration date shows as Expired. */
export function EstimateStatusBadge({ status, expirationDate }: { status: string; expirationDate?: string | null }) {
  const label = isEstimateExpired(status, expirationDate) ? "Expired" : status;
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${STYLES[label] || "bg-slate-100 text-slate-700"}`}
      title={label === "Expired" ? `Pending, expired ${expirationDate}` : undefined}
    >
      {label}
    </span>
  );
}
