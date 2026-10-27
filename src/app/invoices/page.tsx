import Link from "next/link";
import { db } from "@/lib/db";
import { DollarSign, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const overdueOnly = status === "overdue";

  // Overdue first, then the soonest due date
  const invoices = await db.invoiceCache.findMany({
    where: { status: overdueOnly ? "Overdue" : { in: ["Open", "Overdue"] } },
    include: { customer: { select: { id: true, name: true, companyName: true } } },
    orderBy: [{ status: "desc" }, { dueDate: "asc" }],
  });
  const total = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  const filters = [
    { label: "All Open", href: "/invoices", active: !overdueOnly },
    { label: "Overdue", href: "/invoices?status=overdue", active: overdueOnly },
  ];

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
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Due</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4">Status</th>
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
