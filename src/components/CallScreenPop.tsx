"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { PhoneIncoming, X, ExternalLink, FileText, Building2, User, DollarSign, Check, Plus } from "lucide-react";
import { CallPayload } from "@/lib/event-emitter";
import { notifyCallsChanged } from "@/lib/live-calls";
import { CustomerTags } from "@/components/CustomerTags";
import { usePathname } from "next/navigation";
import { isPublicPage } from "@/lib/public-pages";
import { formatLine } from "@/lib/phone-utils";

export function CallScreenPop() {
  const [activeCall, setActiveCall] = useState<CallPayload | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play browser chime for incoming call using Web Audio API
  const playChime = () => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.0, now + 0.15); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      // Audio autoplay policy may restrict before user interaction
    }
  };

  // Read through a ref so toggling mute doesn't tear down and reopen the SSE connection
  const playChimeRef = useRef(playChime);
  playChimeRef.current = playChime;

  // Public pages (login, terms, privacy) have no session, so don't open the call stream there
  const onPublicPage = isPublicPage(usePathname());

  useEffect(() => {
    if (onPublicPage) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let hasConnected = false;

    function connectSSE() {
      eventSource = new EventSource("/api/events");

      // After a reconnect, events may have been missed while the stream was down: resync pages
      eventSource.addEventListener("connected", () => {
        if (hasConnected) notifyCallsChanged();
        hasConnected = true;
      });

      eventSource.addEventListener("incoming_call", (e) => {
        try {
          const payload: CallPayload = JSON.parse(e.data);
          setActiveCall(payload);
          playChimeRef.current();
          notifyCallsChanged({ customerId: payload.customer?.id });
        } catch (err) {
          console.error("Error parsing incoming call event:", err);
        }
      });

      eventSource.addEventListener("call_updated", (e) => {
        try {
          const payload: CallPayload = JSON.parse(e.data);
          setActiveCall((prev) => (prev && prev.callId === payload.callId ? { ...prev, ...payload } : prev));
          notifyCallsChanged({ customerId: payload.customer?.id });
        } catch (err) {
          console.error("Error parsing call update event:", err);
        }
      });

      eventSource.addEventListener("call_ended", (e) => {
        try {
          const payload: CallPayload = JSON.parse(e.data);
          setActiveCall((prev) => {
            if (prev && prev.callId === payload.callId) {
              return { ...prev, status: payload.status };
            }
            return prev;
          });
          notifyCallsChanged({ customerId: payload.customer?.id });
        } catch (err) {
          console.error("Error parsing call ended event:", err);
        }
      });

      eventSource.onerror = async () => {
        eventSource?.close();
        if (closed) return;
        // If the session expired, go to sign-in instead of retrying: endless 401s from an idle
        // tab would look like an attack and get the user's IP banned by SWAG's fail2ban
        try {
          const me = await fetch("/api/auth/me").then((r) => r.json());
          if (!me?.user && !closed) {
            window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
            return;
          }
        } catch {
          // Server unreachable (restart, network blip): keep retrying below
        }
        if (!closed) reconnectTimer = setTimeout(connectSSE, 5000); // Reconnect after 5s
      };
    }

    connectSSE();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [onPublicPage]);

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !activeCall) return;
    setIsSavingNote(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent.trim(),
          customerId: activeCall.customer?.id,
          callLogId: activeCall.id,
          author: "Call Agent",
        }),
      });
      setNoteSaved(true);
      setNoteContent("");
      setTimeout(() => setNoteSaved(false), 2500);
    } catch (err) {
      console.error("Error saving note:", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  if (!activeCall) return null;

  const customer = activeCall.customer;
  const isRinging = activeCall.status === "ringing";

  return (
    <div className="fixed bottom-20 md:bottom-5 inset-x-3 md:inset-x-auto md:right-5 z-50 md:w-full md:max-w-md animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-500 overflow-hidden ring-4 ring-blue-500/10">
        {/* Header Bar */}
        <div className={`px-4 py-3 flex items-center justify-between text-white ${isRinging ? "bg-blue-600 animate-pulse-ring" : "bg-slate-800"}`}>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <PhoneIncoming className="w-4 h-4 text-white animate-bounce" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                UniFi Talk • {isRinging ? "Incoming Call..." : activeCall.status.toUpperCase()}
              </div>
              <div className="text-base font-bold leading-tight">
                {activeCall.formattedFrom}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
              {formatLine(activeCall.toExtension)}
            </span>
            <button
              onClick={() => setActiveCall(null)}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
              title="Dismiss popup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3 bg-slate-50/50">
          {customer ? (
            <div className="space-y-3">
              {/* Customer Match Card */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                      <User className="w-4 h-4 text-blue-600" />
                      {customer.name}
                    </h3>
                    {customer.companyName && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {customer.companyName}
                      </p>
                    )}
                    <CustomerTags customer={customer} className="mt-1.5" />
                    {!!customer.otherMatches && (
                      <Link
                        href={`/customers?q=${encodeURIComponent(activeCall.fromNumber.replace(/\D/g, "").slice(-10))}`}
                        onClick={() => setActiveCall(null)}
                        className="block text-[11px] text-amber-700 hover:text-amber-800 underline mt-1"
                      >
                        {customer.otherMatches} other account{customer.otherMatches === 1 ? "" : "s"} share this number
                      </Link>
                    )}
                  </div>
                  <Link
                    href={`/customers/${customer.id}`}
                    onClick={() => setActiveCall(null)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md flex items-center gap-1 transition"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* QuickBooks Online Summary Banner */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-500 font-medium block">QBO Balance</span>
                    <span className={`text-sm font-bold ${
                      (customer.qboBalance || 0) > 0 ? "text-amber-600" : "text-emerald-600"
                    }`}>
                      ${Number(customer.qboBalance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-500 font-medium block">Open Invoices</span>
                    <span className="text-sm font-bold text-slate-800">
                      {customer.openInvoicesCount || 0} Unpaid
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-amber-900">New or Unrecognized Caller</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  No existing QuickBooks or CRM contact matches this number.
                </p>
              </div>
              <Link
                href={`/customers?newPhone=${encodeURIComponent(activeCall.fromNumber)}`}
                onClick={() => setActiveCall(null)}
                className="text-xs font-semibold bg-amber-600 text-white px-2.5 py-1 rounded-lg hover:bg-amber-700 flex items-center gap-1 transition whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </Link>
            </div>
          )}

          {/* Inline Note-Taker */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-semibold text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Live Call Notes:
              </span>
              {noteSaved && (
                <span className="text-emerald-600 text-[10px] flex items-center gap-0.5 font-bold">
                  <Check className="w-3 h-3" /> Saved to timeline!
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Log notes while on call (e.g. Asked about invoice #1001)..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveNote()}
                className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveNote}
                disabled={isSavingNote || !noteContent.trim()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-slate-100 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200">
          <span>Direction: Inbound</span>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="hover:text-slate-800 underline text-[10px]"
          >
            {isMuted ? "Unmute Ringtone" : "Mute Ringtone"}
          </button>
        </div>
      </div>
    </div>
  );
}
