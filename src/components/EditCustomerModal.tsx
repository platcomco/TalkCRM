"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone-utils";

const FIELDS = ["name", "companyName", "primaryPhone", "mobilePhone", "email", "billingAddress"] as const;
type Form = Record<(typeof FIELDS)[number], string>;

const inputClass =
  "w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Edits (or deletes) a contact that was created in TalkCRM. QuickBooks customers are edited in QuickBooks. */
export function EditCustomerModal({
  customer,
  onClose,
  onSaved,
  onDeleted,
}: {
  customer: any;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<Form>(() => ({
    name: customer.name || "",
    companyName: customer.companyName || "",
    primaryPhone: customer.primaryPhone ? formatPhoneDisplay(customer.primaryPhone) : "",
    mobilePhone: customer.mobilePhone ? formatPhoneDisplay(customer.mobilePhone) : "",
    email: customer.email || "",
    billingAddress: customer.billingAddress || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${customer.name}? Their calls stay in the call log; notes about them are deleted.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Edit Contact</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input type="text" required value={form.name} onChange={set("name")} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
            <input type="text" value={form.companyName} onChange={set("companyName")} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Phone</label>
              <input type="text" value={form.primaryPhone} onChange={set("primaryPhone")} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Phone</label>
              <input type="text" value={form.mobilePhone} onChange={set("mobilePhone")} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Address</label>
            <textarea rows={2} value={form.billingAddress} onChange={set("billingAddress")} className={inputClass} />
          </div>

          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition"
              >
                {busy ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
