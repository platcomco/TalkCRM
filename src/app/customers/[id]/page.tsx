"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  FileText,
  Clock,
  Radio,
  ExternalLink,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Inbox,
  Send,
  MessageSquare,
  MessagesSquare,
  Pencil,
} from "lucide-react";
import { formatPhoneDisplay, formatDuration, formatLine } from "@/lib/phone-utils";
import { useCallsChanged } from "@/lib/live-calls";
import { CustomerTags } from "@/components/CustomerTags";
import { EditCustomerModal } from "@/components/EditCustomerModal";
import { ChatThreadsPanel } from "@/components/ChatThreadsPanel";

// Gmail snippets arrive HTML-escaped ("don&#39;t")
function decodeEntities(text: string): string {
  return (text || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"invoices" | "emails" | "chat" | "calls" | "notes">("invoices");
  const [showEdit, setShowEdit] = useState(false);

  // Note form state
  const [newNote, setNewNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const fetchCustomer = async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setCustomer(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  // Refresh when a call for this customer changes (or after a reconnect, when it's unknown)
  useCallsChanged(({ customerId }) => {
    if (customerId === undefined || customerId === id) fetchCustomer();
  });

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSavingNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newNote.trim(),
          customerId: id,
          author: "Call Agent",
        }),
      });
      if (res.ok) {
        setNewNote("");
        fetchCustomer();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingNote(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading customer...</div>;
  }

  if (!customer) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-slate-600 font-medium">Customer not found.</p>
        <Link href="/customers" className="text-blue-600 text-sm underline">
          Return to directory
        </Link>
      </div>
    );
  }

  const qboBalance = customer.qboBalance || 0;
  const isOverdue = qboBalance > 0;
  // "ok" | "not_connected" | "expired" | "error" (older API responses have no status)
  const emailStatus: string = customer.emailStatus || "ok";

  return (
    <div className="space-y-6">
      {showEdit && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            fetchCustomer();
          }}
          onDeleted={() => router.push("/customers")}
        />
      )}

      {/* Back button */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Customers</span>
        </Link>
      </div>

      {/* Customer header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <User className="w-6 h-6 text-blue-600" />
                {customer.name}
              </h1>
              {customer.qboId ? (
                <span
                  className="text-[11px] font-mono bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-semibold border border-blue-200"
                  title="Synced from QuickBooks. Edit this customer in QuickBooks; changes appear after the next sync."
                >
                  QBO: {customer.qboId}
                </span>
              ) : (
                <>
                  <span
                    className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-semibold border border-slate-200"
                    title="Added in TalkCRM. If this person is later added in QuickBooks with the same phone or email, the next sync merges them."
                  >
                    TalkCRM contact
                  </span>
                  <button
                    onClick={() => setShowEdit(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </>
              )}
            </div>

            {customer.companyName && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                {customer.companyName}
              </p>
            )}
            <CustomerTags customer={customer} className="pt-1" />
            {customer.qboNotes && (
              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 max-w-xl whitespace-pre-line">
                <span className="font-semibold text-amber-800">QuickBooks notes: </span>
                {customer.qboNotes}
              </p>
            )}
          </div>

          {/* QuickBooks Balance Box */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-6 self-start lg:self-auto">
            <div>
              <span className="text-xs font-medium text-slate-500 block">QuickBooks Balance</span>
              <span className={`text-2xl font-extrabold ${isOverdue ? "text-amber-600" : "text-emerald-600"}`}>
                ${Number(qboBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <a
              href={
                customer.qboId
                  ? `https://app.qbo.intuit.com/app/customerdetail?nameId=${encodeURIComponent(customer.qboId)}`
                  : "https://app.qbo.intuit.com"
              }
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm"
            >
              <span>QBO Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Contact Metadata Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2.5 text-slate-700">
            <Phone className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-900">Phone Numbers</span>
              <span>Primary: {formatPhoneDisplay(customer.primaryPhone || "None")}</span>
              {customer.mobilePhone && (
                <span className="block text-slate-500">Mobile: {formatPhoneDisplay(customer.mobilePhone)}</span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-slate-700">
            <Mail className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-900">Email Address</span>
              <span>{customer.email || "No email on file"}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-slate-700">
            <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold block text-slate-900">Billing Address</span>
              <span className="text-slate-600">{customer.billingAddress || "No address on file"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto whitespace-nowrap border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex items-center gap-2 py-3 px-5 border-b-2 transition ${
              activeTab === "invoices"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>QuickBooks Invoices ({customer.invoices?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("emails")}
            className={`flex items-center gap-2 py-3 px-5 border-b-2 transition ${
              activeTab === "emails"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Gmail Conversations</span>
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 py-3 px-5 border-b-2 transition ${
              activeTab === "chat"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <MessagesSquare className="w-4 h-4" />
            <span>Site Visits ({customer.chatThreads?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("calls")}
            className={`flex items-center gap-2 py-3 px-5 border-b-2 transition ${
              activeTab === "calls"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>UniFi Talk Calls ({customer.calls?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`flex items-center gap-2 py-3 px-5 border-b-2 transition ${
              activeTab === "notes"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Notes & Timeline ({customer.notes?.length || 0})</span>
          </button>
        </div>

        {/* Tab 1: Invoices */}
        {activeTab === "invoices" && (
          <div className="p-6">
            {!customer.invoices || customer.invoices.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No invoices found in QuickBooks for this customer.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3">Total Amount</th>
                      <th className="py-2.5 px-3">Open Balance</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.invoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          #{inv.docNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{inv.txnDate || "N/A"}</td>
                        <td className="py-3 px-3 text-slate-600">{inv.dueDate || "N/A"}</td>
                        <td className="py-3 px-3 text-slate-900 font-semibold">
                          ${inv.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          ${inv.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                            inv.status === "Paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : inv.status === "Overdue"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Emails (Google Workspace) */}
        {activeTab === "emails" && (
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900">
              <Mail className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold block">Google Workspace / Gmail Integration</span>
                <span>
                  Querying recent messages involving <strong className="font-semibold">{customer.email || "customer email"}</strong>.
                </span>
              </div>
            </div>

            {!customer.email ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                Add an email address to this customer to enable Gmail thread lookup.
              </div>
            ) : emailStatus === "not_connected" ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
                <p className="text-slate-600 font-medium text-sm">You haven't connected your Google account yet.</p>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Each person connects their own Gmail once in Settings; TalkCRM then shows this customer's emails from your mailbox.
                </p>
                <Link
                  href="/settings"
                  className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                >
                  Connect My Google Account
                </Link>
              </div>
            ) : emailStatus === "expired" ? (
              <div className="border border-amber-200 bg-amber-50 rounded-xl p-8 text-center space-y-2">
                <p className="text-amber-900 font-medium text-sm">Google connection expired.</p>
                <p className="text-amber-800 text-xs max-w-md mx-auto">
                  {customer.emailMessage || "Google authorization expired or was revoked."} Reconnect in Settings to resume Gmail lookups.
                </p>
                <Link
                  href="/settings"
                  className="inline-block mt-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                >
                  Reconnect Google
                </Link>
              </div>
            ) : emailStatus === "error" ? (
              <div className="border border-rose-200 bg-rose-50 rounded-xl p-8 text-center space-y-2">
                <p className="text-rose-900 font-medium text-sm">Couldn't load Gmail conversations.</p>
                <p className="text-rose-800 text-xs max-w-md mx-auto">
                  {customer.emailMessage || "An unexpected error occurred while contacting Gmail."}
                </p>
                <p className="text-rose-700 text-[11px] max-w-md mx-auto">
                  Details are in the server log (look for lines starting with [gmail]).
                </p>
              </div>
            ) : !customer.emails || customer.emails.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
                <p className="text-slate-600 font-medium text-sm">No emails found for this customer.</p>
                <p className="text-slate-500 text-xs max-w-md mx-auto">
                  Google is connected, but the connected mailbox has no recent messages to, from, or cc'ing {customer.email}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {customer.emails.map((email: any) => (
                  <a
                    key={email.id}
                    href={email.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open this conversation in Gmail"
                    className="block bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1.5 hover:border-blue-300 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">{email.subject}<ExternalLink className="w-3 h-3 text-slate-400 shrink-0" /></span>
                      <span className="text-[11px] text-slate-500 shrink-0">{email.date ? new Date(email.date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">From:</span> {email.from}
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      {decodeEntities(email.snippet)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Google Chat site-visit threads */}
        {activeTab === "chat" && <ChatThreadsPanel customer={customer} onChanged={fetchCustomer} />}

        {/* Tab 3: UniFi Talk Calls */}
        {activeTab === "calls" && (
          <div className="p-6">
            {!customer.calls || customer.calls.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No past calls logged for this customer.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">From Number</th>
                      <th className="py-2.5 px-3">Line</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.calls.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 text-slate-600">
                          {new Date(c.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          {formatPhoneDisplay(c.fromNumber)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{formatLine(c.toExtension)}</td>
                        <td className="py-3 px-3 capitalize">{c.direction}</td>
                        <td className="py-3 px-3">{formatDuration(c.duration)}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                            c.status === "completed" ? "bg-slate-100 text-slate-700" : c.status === "missed" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                          }`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Notes & Timeline */}
        {activeTab === "notes" && (
          <div className="p-6 space-y-6">
            {/* Note creation input */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Add Customer or Call Note</label>
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  placeholder="Record customer preferences, promise to pay, invoice follow-ups, or notes from call..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <button
                  type="submit"
                  disabled={isSavingNote || !newNote.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm self-end transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSavingNote ? "Saving..." : "Add Note"}</span>
                </button>
              </div>
            </form>

            {/* Notes history list */}
            <div className="space-y-3">
              {!customer.notes || customer.notes.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No notes recorded yet.
                </div>
              ) : (
                customer.notes.map((note: any) => (
                  <div key={note.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{note.author}</span>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(note.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
