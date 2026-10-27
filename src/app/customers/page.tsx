"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Search, Plus, Phone, Mail, Building2, ExternalLink, DollarSign, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatPhoneDisplay, extractDigits } from "@/lib/phone-utils";
import { useCallsChanged } from "@/lib/live-calls";
import { CustomerTags } from "@/components/CustomerTags";

type SortKey = "name" | "contact" | "balance" | "activity";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const SORT_STORAGE_KEY = "talkcrm.customers.sort";
const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };
// Columns that read best largest-first when first clicked
const DESC_FIRST: SortKey[] = ["balance", "activity"];

// Natural order ("Unit 2" before "Unit 10"), case-insensitive
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareCustomers(a: any, b: any, { key, dir }: SortState): number {
  const sign = dir === "asc" ? 1 : -1;
  const byName = collator.compare(a.name || "", b.name || "");

  if (key === "name") return sign * byName;

  if (key === "contact") {
    const pa = extractDigits(a.primaryPhone || a.mobilePhone || "");
    const pb = extractDigits(b.primaryPhone || b.mobilePhone || "");
    // Customers without a phone always go last
    if (!pa || !pb) return pa ? -1 : pb ? 1 : byName;
    return sign * collator.compare(pa, pb) || byName;
  }

  const va = key === "balance" ? a.qboBalance || 0 : a._count?.calls || 0;
  const vb = key === "balance" ? b.qboBalance || 0 : b._count?.calls || 0;
  return sign * (va - vb) || byName;
}

function loadSort(): SortState {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) || "null");
    if (saved && ["name", "contact", "balance", "activity"].includes(saved.key) && ["asc", "desc"].includes(saved.dir)) {
      return saved;
    }
  } catch {
    // Storage unavailable: fall back to the default
  }
  return DEFAULT_SORT;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="py-3 px-4" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-blue-600 transition ${active ? "text-blue-700" : ""}`}
      >
        <span>{label}</span>
        <Icon className={`w-3 h-3 ${active ? "" : "text-slate-400"}`} />
      </button>
    </th>
  );
}

function CustomersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";
  const initialNewPhone = searchParams.get("newPhone") || "";

  const [query, setQuery] = useState(initialQuery);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(!!initialNewPhone);

  // New Customer Form State
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    companyName: "",
    primaryPhone: initialNewPhone ? formatPhoneDisplay(initialNewPhone) : "",
    mobilePhone: "",
    email: "",
    billingAddress: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  useEffect(() => {
    setSort(loadSort());
  }, []);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      const next: SortState =
        prev.key === key
          ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
          : { key, dir: DESC_FIRST.includes(key) ? "desc" : "asc" };
      try {
        localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not persisted; sorting still works for this visit
      }
      return next;
    });
  };

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => compareCustomers(a, b, sort)),
    [customers, sort]
  );

  // Background refreshes skip the loading state so the table doesn't flash
  const fetchCustomers = async (search: string = "", background = false) => {
    if (!background) setLoading(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(search)}`);
      const data = await res.json();
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(query);
  }, [query]);

  // Keep call counts current as calls come in
  useCallsChanged(() => fetchCustomers(query, true));

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer),
      });
      if (res.ok) {
        // Open the new contact: any earlier calls from its number are linked to it now
        const created = await res.json();
        router.push(`/customers/${created.id}`);
        setShowAddModal(false);
        setNewCustomer({
          name: "",
          companyName: "",
          primaryPhone: "",
          mobilePhone: "",
          email: "",
          billingAddress: "",
        });
        fetchCustomers(query);
      }
    } catch (err) {
      console.error("Error creating customer:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <span>Customer Directory</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Synced from QuickBooks Online and created from UniFi Talk caller IDs.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search by name, company, phone, DTV account #, client type, or notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
      </div>

      {/* Customer List Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No customers found matching &quot;{query}&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <SortHeader label="Customer / Company" sortKey="name" sort={sort} onSort={handleSort} />
                  <SortHeader label="Contact Details" sortKey="contact" sort={sort} onSort={handleSort} />
                  <SortHeader label="QBO Balance" sortKey="balance" sort={sort} onSort={handleSort} />
                  <SortHeader label="Activity" sortKey="activity" sort={sort} onSort={handleSort} />
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCustomers.map((c) => {
                  const hasBalance = (c.qboBalance || 0) > 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-bold text-slate-900 hover:text-blue-600 transition text-sm block"
                        >
                          {c.name}
                        </Link>
                        {c.companyName && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {c.companyName}
                          </span>
                        )}
                        <CustomerTags customer={c} className="mt-1" />
                      </td>
                      <td className="py-3.5 px-4 space-y-1">
                        {c.primaryPhone && (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{formatPhoneDisplay(c.primaryPhone)}</span>
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{c.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs ${
                          hasBalance ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          ${Number(c.qboBalance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                        {c.qboId && (
                          <span className="block text-[10px] text-slate-400 mt-0.5 font-mono">
                            QBO ID: {c.qboId}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] space-y-0.5">
                        <div>Calls: <span className="font-semibold text-slate-700">{c._count?.calls || 0}</span></div>
                        <div>Invoices: <span className="font-semibold text-slate-700">{c._count?.invoices || 0}</span></div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/customers/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add New Customer</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corporation"
                  value={newCustomer.companyName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Phone</label>
                  <input
                    type="text"
                    placeholder="(555) 000-0000"
                    value={newCustomer.primaryPhone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, primaryPhone: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    placeholder="(555) 000-0000"
                    value={newCustomer.mobilePhone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, mobilePhone: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="customer@company.com"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  placeholder="123 Main St, City, State ZIP"
                  value={newCustomer.billingAddress}
                  onChange={(e) => setNewCustomer({ ...newCustomer, billingAddress: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                >
                  {isSubmitting ? "Saving..." : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading customer directory...</div>}>
      <CustomersContent />
    </Suspense>
  );
}
