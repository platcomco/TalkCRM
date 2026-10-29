import Link from "next/link";
import { db } from "@/lib/db";
import { ClipboardList, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { isEstimateExpired, qboEstimateUrl } from "@/lib/qbo-links";
import { EstimateStatusBadge } from "@/components/EstimateStatusBadge";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Natural order ("1002" before "1010"), case-insensitive
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Estimate = {
  docNumber: string;
  txnDate: string | null;
  expirationDate: string | null;
  totalAmount: number;
  status: string;
  customer: { name: string };
};

const SORTS: Record<string, { label: string; compare: (a: Estimate, b: Estimate) => number; descFirst?: boolean }> = {
  customer: { label: "Customer", compare: (a, b) => collator.compare(a.customer.name, b.customer.name) },
  estimate: { label: "Estimate #", compare: (a, b) => collator.compare(a.docNumber, b.docNumber) },
  date: { label: "Date", compare: (a, b) => (a.txnDate || "").localeCompare(b.txnDate || ""), descFirst: true },
  expires: { label: "Expires", compare: (a, b) => (a.expirationDate || "").localeCompare(b.expirationDate || "") },
  total: { label: "Total", compare: (a, b) => a.totalAmount - b.totalAmount, descFirst: true },
  status: { label: "Status", compare: (a, b) => a.status.localeCompare(b.status) },
};

const FILTERS = [
  { key: "", label: "All Open" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "expired", label: "Expired" },
];

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { status: statusParam, sort: sortParam, dir: dirParam } = await searchParams;
  const filter = FILTERS.some((f) => f.key === statusParam) ? statusParam || "" : "";
  // Newest first unless a column is chosen
  const sortKey = sortParam && SORTS[sortParam] ? sortParam : "date";
  const dir = sortParam && SORTS[sortParam] ? (dirParam === "desc" ? "desc" : "asc") : "desc";

  // The sync caches only estimates awaiting a decision (Pending or Accepted), however old
  const all = await db.estimateCache.findMany({
    include: { customer: { select: { id: true, name: true, companyName: true } } },
  });
  const estimates = all.filter((est) =>
    filter === "pending"
      ? est.status === "Pending"
      : filter === "accepted"
      ? est.status === "Accepted"
      : filter === "expired"
      ? isEstimateExpired(est.status, est.expirationDate)
      : true
  );
  estimates.sort(
    (a, b) =>
      (dir === "asc" ? 1 : -1) * SORTS[sortKey].compare(a, b) || collator.compare(b.txnDate || "", a.txnDate || "")
  );
  const total = estimates.reduce((sum, est) => sum + est.totalAmount, 0);

  const hrefFor = (params: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return `/estimates${query.size ? `?${query}` : ""}`;
  };
  // Clicking a column sorts by it; clicking it again flips the direction
  const sortHref = (key: string) => {
    const nextDir = sortKey === key ? (dir === "asc" ? "desc" : "asc") : SORTS[key].descFirst ? "desc" : "asc";
    return hrefFor({ status: filter, sort: key, dir: nextDir });
  };
  const sortHeader = (key: string, align: "left" | "right" = "left") => {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        className={`py-3 px-4 ${align === "right" ? "text-right" : ""}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <Link
          href={sortHref(key)}
          scroll={false}
          className={`inline-flex items-center gap-1 hover:text-blue-600 transition ${active ? "text-blue-700" : ""}`}
        >
          <span>{SORTS[key].label}</span>
          <Icon className={`w-3 h-3 ${active ? "" : "text-slate-400"}`} />
        </Link>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-violet-600" />
            <span>Open Estimates</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {estimates.length} estimate{estimates.length === 1 ? "" : "s"} totaling{" "}
            <span className="font-semibold text-slate-700">{money(total)}</span>, pending or accepted in QuickBooks as of the
            last sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl shadow-sm self-start sm:self-auto text-xs">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={hrefFor({ status: f.key, sort: sortParam || "", dir: sortParam ? dir : "" })}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filter === f.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {estimates.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {filter ? "No estimates match this filter." : "No pending or accepted estimates."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  {sortHeader("customer")}
                  {sortHeader("estimate")}
                  {sortHeader("date")}
                  {sortHeader("expires")}
                  <th className="py-3 px-4">For</th>
                  {sortHeader("total", "right")}
                  {sortHeader("status")}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estimates.map((est) => (
                  <tr key={est.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <Link
                        href={`/customers/${est.customer.id}?tab=estimates`}
                        className="font-bold text-slate-900 hover:text-blue-600 transition block text-sm"
                      >
                        {est.customer.name}
                      </Link>
                      {est.customer.companyName && (
                        <span className="text-[11px] text-slate-500">{est.customer.companyName}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">#{est.docNumber}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{est.txnDate || "—"}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{est.expirationDate || "—"}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs">{est.summary || "—"}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{money(est.totalAmount)}</td>
                    <td className="py-3 px-4">
                      <EstimateStatusBadge status={est.status} expirationDate={est.expirationDate} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={qboEstimateUrl(est.qboEstimateId)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition whitespace-nowrap"
                      >
                        <span>Open in QBO</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
