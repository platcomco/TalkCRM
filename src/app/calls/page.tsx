"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, PhoneIncoming, PhoneCall, ExternalLink, Filter, Clock } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import { useCallsChanged } from "@/lib/live-calls";

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Background refreshes skip the loading state so the table doesn't flash
  const fetchCalls = async (status: string = "", background = false) => {
    if (!background) setLoading(true);
    try {
      const url = status ? `/api/calls?status=${encodeURIComponent(status)}` : "/api/calls";
      const res = await fetch(url);
      const data = await res.json();
      setCalls(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls(statusFilter);
  }, [statusFilter]);

  useCallsChanged(() => fetchCalls(statusFilter, true));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Radio className="w-6 h-6 text-blue-600" />
            <span>Telephony & Call Logs</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time inbound and outbound calls captured from your UniFi Talk PBX.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl shadow-sm self-start sm:self-auto text-xs">
          {[
            { label: "All Calls", value: "" },
            { label: "Ringing", value: "ringing" },
            { label: "Completed", value: "completed" },
            { label: "Missed", value: "missed" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === f.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading call logs...</div>
        ) : calls.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No calls found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Caller ID</th>
                  <th className="py-3 px-4">Matched Customer</th>
                  <th className="py-3 px-4">QBO Balance</th>
                  <th className="py-3 px-4">Extension</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 text-slate-600">
                      {new Date(c.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                      {c.formattedFrom || formatPhoneDisplay(c.fromNumber)}
                    </td>
                    <td className="py-3.5 px-4">
                      {c.customer ? (
                        <div>
                          <Link
                            href={`/customers/${c.customer.id}`}
                            className="font-bold text-slate-900 hover:text-blue-600 transition block text-sm"
                          >
                            {c.customer.name}
                          </Link>
                          {c.customer.companyName && (
                            <span className="text-[11px] text-slate-500">
                              {c.customer.companyName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unlinked Caller</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {c.customer ? (
                        <span className={`font-semibold ${
                          (c.customer.qboBalance || 0) > 0 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          ${Number(c.customer.qboBalance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{c.toExtension || "101"}</td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {c.duration > 0 ? `${c.duration}s` : "0s"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        c.status === "completed"
                          ? "bg-slate-100 text-slate-700"
                          : c.status === "ringing"
                          ? "bg-blue-100 text-blue-700 animate-pulse"
                          : c.status === "missed"
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {c.customer ? (
                        <Link
                          href={`/customers/${c.customer.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                        >
                          <span>Dossier</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <Link
                          href={`/customers?newPhone=${encodeURIComponent(c.fromNumber)}`}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2 py-1 rounded-md transition"
                        >
                          Create
                        </Link>
                      )}
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
