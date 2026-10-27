"use client";

import { useEffect, useState } from "react";
import { MessagesSquare, RefreshCw, Trash2, Plus, AlertCircle } from "lucide-react";

function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "never";
}

/** Chooses which Google Chat spaces hold per-customer site-visit threads, and syncs them. */
export function ChatSpacesSettings({ chatConnected, autoSync }: { chatConnected: boolean; autoSync: boolean }) {
  const [data, setData] = useState<{ selected: any[]; available: any[]; availableError: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/integrations/chat/spaces");
      setData(await res.json());
    } catch (err: any) {
      setMessage(`Couldn't load Chat spaces: ${err.message}`);
    }
  };

  useEffect(() => {
    load();
  }, [chatConnected]);

  const addSpace = async (space: { name: string; displayName: string }) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/chat/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(space),
      });
      const result = await res.json();
      setMessage(
        res.ok
          ? `Added "${space.displayName}". The first sync is running in the background; refresh this page in a minute to see its threads.`
          : `Couldn't add the space: ${result.error}`
      );
      load();
    } finally {
      setBusy(false);
    }
  };

  const removeSpace = async (space: any) => {
    if (!confirm(`Stop reading "${space.displayName}"? Its threads disappear from TalkCRM (nothing changes in Google Chat).`)) return;
    await fetch(`/api/integrations/chat/spaces?name=${encodeURIComponent(space.name)}`, { method: "DELETE" });
    load();
  };

  const syncNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/chat/sync", { method: "POST" });
      const r = await res.json();
      if (!res.ok) {
        setMessage(`Sync failed: ${r.error}`);
      } else {
        setMessage(
          `Chat sync complete: ${r.messages} new or updated messages, ${r.linked} threads matched to customers.` +
            (r.errors?.length ? ` Problems: ${r.errors.join("; ")}` : "")
        );
      }
      load();
    } finally {
      setBusy(false);
    }
  };

  const selectedNames = new Set((data?.selected || []).map((s) => s.name));
  const addable = (data?.available || []).filter((s) => !selectedNames.has(s.name));

  return (
    <div id="google-chat" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 scroll-mt-20">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <MessagesSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">Google Chat Site-Visit Notes</h2>
            <p className="text-xs text-slate-500">
              Threads in these spaces appear on the matching customer&apos;s page
              {autoSync ? " (synced every 10 minutes)" : ""}.
            </p>
          </div>
        </div>
        {(data?.selected?.length || 0) > 0 && (
          <button
            onClick={syncNow}
            disabled={busy}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
            <span>Sync Now</span>
          </button>
        )}
      </div>

      {message && <p className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2">{message}</p>}

      <div className="space-y-2 text-xs">
        {!data ? (
          <p className="text-slate-500">Loading spaces...</p>
        ) : data.selected.length === 0 ? (
          <p className="text-slate-500">No spaces added yet.</p>
        ) : (
          data.selected.map((s) => (
            <div key={s.name} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{s.displayName}</div>
                <div className="text-[11px] text-slate-500">
                  {s._count?.threads || 0} threads · last synced {formatTime(s.lastSyncedAt)} · read as {s.syncAsEmail}
                </div>
                {s.lastError && (
                  <div className="text-[11px] text-rose-700 flex items-start gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{s.lastError}</span>
                  </div>
                )}
              </div>
              <button onClick={() => removeSpace(s)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded" title="Remove space">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
        <h3 className="font-semibold text-slate-700">Add a space you&apos;re a member of</h3>
        {!chatConnected ? (
          <p className="text-slate-500">Connect your Google account above (with Chat access) to choose spaces.</p>
        ) : data?.availableError ? (
          <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{data.availableError}</p>
        ) : addable.length === 0 ? (
          <p className="text-slate-500">{data ? "No other spaces found." : "Loading..."}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {addable.map((s) => (
              <button
                key={s.name}
                onClick={() => addSpace(s)}
                disabled={busy}
                className="border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" />
                <span>{s.displayName}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          A space is read with the Google account of whoever adds it, so that person must stay a member of it.
        </p>
      </div>
    </div>
  );
}
