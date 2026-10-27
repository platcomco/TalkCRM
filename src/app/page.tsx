import Link from "next/link";
import { db } from "@/lib/db";
import { formatPhoneDisplay, formatDuration } from "@/lib/phone-utils";
import { PhoneCall, Users, DollarSign, Clock, AlertTriangle, ArrowRight, PhoneIncoming, ShieldCheck, ExternalLink, FileText } from "lucide-react";
import { LiveRefresh } from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

const kpiCardClass =
  "bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-blue-300 hover:shadow-md transition";

export default async function DashboardPage() {
  const [customerCount, callCount, calls, openInvoices, qbo] = await Promise.all([
    db.customer.count(),
    db.callLog.count(),
    db.callLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 8,
      include: {
        customer: true,
        notes: true,
      },
    }),
    db.invoiceCache.findMany({
      where: { status: { in: ["Open", "Overdue"] } },
      include: { customer: true },
      // Overdue first, then the soonest due date
      orderBy: [{ status: "desc" }, { dueDate: "asc" }],
    }),
    db.integration.findUnique({ where: { provider: "quickbooks" }, select: { lastSyncedAt: true } }),
  ]);
  const lastSync = qbo?.lastSyncedAt
    ? qbo.lastSyncedAt.toLocaleString("en-US", {
        timeZone: process.env.TZ || "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const totalOutstanding = openInvoices.reduce((acc, inv) => acc + (inv.balance || 0), 0);
  const overdueCount = openInvoices.filter((inv) => inv.status === "Overdue").length;

  return (
    <div className="space-y-6">
      <LiveRefresh />
      {/* Top Welcome & PBX Status Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 bg-blue-500/30 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-blue-100">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              UniFi Talk PBX Live Screen-Pop Ready
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Customer Telephony & Financial Hub
            </h1>
            <p className="text-blue-100 text-sm max-w-2xl">
              Incoming calls from your UniFi Talk PBX instantly trigger real-time screen-pops, cross-referencing customer contact info and QuickBooks balances before you answer.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <Link
              href="/settings"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/20 transition flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Integration Settings</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers */}
        <Link href="/customers" className={kpiCardClass}>
          <div>
            <p className="text-xs font-medium text-slate-500">Customers</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{customerCount}</p>
            <p className="text-[11px] text-blue-600 font-medium mt-1">
              {lastSync ? `QuickBooks synced ${lastSync}` : "QuickBooks not synced yet"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </Link>

        {/* Total Calls Logged */}
        <Link href="/calls" className={kpiCardClass}>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Calls Logged</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{callCount}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">UniFi Talk PBX</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <PhoneCall className="w-6 h-6" />
          </div>
        </Link>

        {/* Outstanding Balance */}
        <Link href="/invoices" className={kpiCardClass}>
          <div>
            <p className="text-xs font-medium text-slate-500">Open QBO Receivables</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              ${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{openInvoices.length} unpaid invoices</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </Link>

        {/* Overdue Alerts */}
        <Link href="/invoices?status=overdue" className={kpiCardClass}>
          <div>
            <p className="text-xs font-medium text-slate-500">Overdue Invoices</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{overdueCount}</p>
            <p className="text-[11px] text-rose-600 font-medium mt-1">
              {overdueCount > 0 ? "Action required" : "Nothing overdue"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </Link>
      </div>

      {/* Main Grid: Recent Calls & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Calls Feed */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-base">Recent Telephony Activity</h2>
            </div>
            <Link
              href="/calls"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {calls.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No calls recorded yet. Calls appear here as they come in from UniFi Talk.
              </div>
            ) : (
              calls.map((call) => {
                const isOverdue = (call.customer?.qboBalance || 0) > 0;
                return (
                  <div key={call.id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 mt-0.5">
                        <PhoneCall className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {call.customer ? (
                            <Link
                              href={`/customers/${call.customer.id}`}
                              className="font-bold text-slate-900 hover:text-blue-600 transition text-sm"
                            >
                              {call.customer.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-800 text-sm">
                              {formatPhoneDisplay(call.fromNumber)}
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            call.status === "completed"
                              ? "bg-slate-100 text-slate-700"
                              : call.status === "ringing"
                              ? "bg-blue-100 text-blue-700 animate-pulse"
                              : call.status === "missed"
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {call.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                          <span>{formatPhoneDisplay(call.fromNumber)}</span>
                          {call.customer?.companyName && (
                            <>
                              <span>•</span>
                              <span>{call.customer.companyName}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{new Date(call.timestamp).toLocaleString("en-US", { timeZone: process.env.TZ || "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                          {call.duration > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatDuration(call.duration)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {call.customer && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-medium">QBO Balance</span>
                          <span className={`text-xs font-bold ${isOverdue ? "text-amber-600" : "text-emerald-600"}`}>
                            ${Number(call.customer.qboBalance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {call.customer ? (
                        <Link
                          href={`/customers/${call.customer.id}`}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="View customer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      ) : (
                        <Link
                          href={`/customers?newPhone=${encodeURIComponent(call.fromNumber)}`}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2 py-1 rounded-md transition"
                        >
                          Add Contact
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Open Invoices & Quick Actions */}
        <div className="space-y-6">
          {/* Open Invoices Widget */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <span>Open QuickBooks Invoices</span>
              </h2>
              <Link
                href="/invoices"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {openInvoices.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  All accounts are fully paid!
                </div>
              ) : (
                openInvoices.slice(0, 5).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/customers/${inv.customer.id}`}
                    className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {inv.customer.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Inv #{inv.docNumber} • Due {inv.dueDate || "N/A"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">
                        ${inv.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        inv.status === "Overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
