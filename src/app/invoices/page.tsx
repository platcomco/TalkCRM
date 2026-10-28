import Link from "next/link";
import { db } from "@/lib/db";
import { DollarSign, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Natural order ("INV 2" before "INV 10"), case-insensitive
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Invoice = {
  docNumber: string;
  txnDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  balance: number;
  status: string;
  customer: { name: string };
};

const SORTS: Record<string, { label: string; compare: (a: Invoice, b: Invoice) => number; descFirst?: boolean }> = {
  customer: { label: "Customer", compare: (a, b) => collator.compare(a.customer.name, b.customer.name) },
  invoice: { label: "Invoice #", compare: (a, b) => collator.compare(a.docNumber, b.docNumber) },
  date: { label: "Date", compare: (a, b) => (a.txnDate || "").localeCompare(b.txnDate || ""), descFirst: true },
  due: { label: "Due", compare: (a, b) => (a.dueDate || "").localeCompare(b.dueDate || "") },
  total: { label: "Total", compare: (a, b) => a.totalAmount - b.totalAmount, descFirst: true },
  balance: { label: "Balance", compare: (a, b) => a.balance - b.balance, descFirst: true },
  status: { label: "Status", compare: (a, b) => a.status.localeCompare(b.status) },
};

// Default: overdue first, then the soonest due date
const defaultCompare = (a: Invoice, b: Invoice) =>
  b.status.localeCompare(a.status) || (a.dueDate || "").localeCompare(b.dueDate || "");

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { status, sort: sortParam, dir: dirParam } = await searchParams;
  const overdueOnly = status === "overdue";
  const sortKey = sortParam && SORTS[sortParam] ? sortParam : null;
  const dir = dirParam === "desc" ? "desc" : "asc";

  const invoices = await db.invoiceCache.findMany({
    where: { status: overdueOnly ? "Overdue" : { in: ["Open", "Overdue"] } },
    include: { customer: { select: { id: true, name: true, companyName: true } } },
  });
  invoices.sort((a, b) => {
    if (!sortKey) return defaultCompare(a, b);
    // Ties fall back to the default order
    return (dir === "asc" ? 1 : -1) * SORTS[sortKey].compare(a, b) || defaultCompare(a, b);
  });
  const total = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  const filters = [
    { label: "All Open", href: "/invoices", active: !overdueOnly },
    { label: "Overdue", href: "/invoices?status=overdue", active: overdueOnly },
  ];

  // Clicking a column sorts by it; clicking it again flips the direction
  const sortHref = (key: string) => {
    const nextDir = sortKey === key ? (dir === "asc" ? "desc" : "asc") : SORTS[key].descFirst ? "desc" : "asc";
    const params = new URLSearchParams({ ...(overdueOnly ? { status: "overdue" } : {}), sort: key, dir: nextDir });
    return `/invoices?${params}`;
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
            <DollarSign className="w-6 h-6 text-amber-600" />
            <span>{overdueOnly ? "Overdue Invoices" : "Open Invoices"}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {invoices.length} unpaid invoice{invoices.length === 1 ? "" : "s"} totaling{" "}
            <span className="font-semibold text-slate-700">{money(total)}</span>, from the last QuickBooks sync.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl shadow-sm self-start sm:self-auto text-xs">
          {filters.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                f.active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {overdueOnly ? "No overdue invoices." : "All accounts are fully paid!"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  {sortHeader("customer")}
                  {sortHeader("invoice")}
                  {sortHeader("date")}
                  {sortHeader("due")}
                  {sortHeader("total", "right")}
                  {sortHeader("balance", "right")}
                  {sortHeader("status")}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <Link
                        href={`/customers/${inv.customer.id}`}
                        className="font-bold text-slate-900 hover:text-blue-600 transition block text-sm"
                      >
                        {inv.customer.name}
                      </Link>
                      {inv.customer.companyName && (
                        <span className="text-[11px] text-slate-500">{inv.customer.companyName}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">#{inv.docNumber}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{inv.txnDate || "—"}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{inv.dueDate || "—"}</td>
                    <td className="py-3 px-4 text-right text-slate-600">{money(inv.totalAmount)}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{money(inv.balance)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                          inv.status === "Overdue" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={`https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(inv.qboInvoiceId.replace(/^qbo-/, ""))}`}
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
