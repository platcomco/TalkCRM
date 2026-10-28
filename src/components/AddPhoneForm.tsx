"use client";

import { useState } from "react";
import { formatPhoneDisplay } from "@/lib/phone-utils";

const inputClass =
  "w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

/**
 * Adds a phone number (e.g. a customer's cell) to an existing customer so their calls match.
 * QuickBooks customers can also get it saved in QuickBooks.
 */
export function AddPhoneForm({
  customer,
  initialPhone = "",
  onSaved,
  onCancel,
}: {
  customer: { id: string; name: string; qboId?: string | null };
  initialPhone?: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState(initialPhone ? formatPhoneDisplay(initialPhone) : "");
  const [saveToQuickBooks, setSaveToQuickBooks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, saveToQuickBooks: !!customer.qboId && saveToQuickBooks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.message);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Phone number for {customer.name}</label>
        <input
          type="tel"
          required
          placeholder="(555) 000-0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>

      {customer.qboId ? (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={saveToQuickBooks}
            onChange={(e) => setSaveToQuickBooks(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also save to QuickBooks
            <span className="block text-[11px] text-slate-500">
              Goes in the customer&apos;s Mobile or Alternate phone if one is empty. Existing numbers are never replaced.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-[11px] text-slate-500">This contact isn&apos;t in QuickBooks, so the number is saved in TalkCRM.</p>
      )}

      {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end space-x-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition"
        >
          {busy ? "Saving..." : "Add Number"}
        </button>
      </div>
    </form>
  );
}
