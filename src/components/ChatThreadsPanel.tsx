"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, Unlink, Paperclip, Search, MessagesSquare } from "lucide-react";

const RECENT_MESSAGES = 15;

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ThreadCard({ thread, onUnlink }: { thread: any; onUnlink: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const messages: any[] = thread.messages || [];
  const hidden = showAll ? 0 : Math.max(0, messages.length - RECENT_MESSAGES);
  // Always keep the first message (it says what the thread is about) above the most recent ones
  const visible = hidden > 0 ? [messages[0], ...messages.slice(-(RECENT_MESSAGES - 1))] : messages;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500 font-medium">
            {thread.space?.displayName} · {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}
            {thread.linkSource === "auto" && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">matched automatically</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={thread.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
          >
            <span>Open in Chat</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onUnlink}
            className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg flex items-center gap-1 transition"
            title="This thread isn't about this customer"
          >
            <Unlink className="w-3 h-3" />
            <span>Unlink</span>
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {visible.map((m, i) => (
          <div key={m.name}>
            {hidden > 0 && i === 1 && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full text-[11px] text-blue-600 hover:bg-blue-50 py-1.5 font-semibold"
              >
                Show {hidden} earlier message{hidden === 1 ? "" : "s"}
              </button>
            )}
            <div className="px-4 py-2.5 space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-800">{m.senderName || "Unknown"}</span>
                <span className="text-slate-400">{formatTime(m.createTime)}</span>
              </div>
              {m.text && <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{m.text}</p>}
              {m.attachmentCount > 0 && (
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
                >
                  <Paperclip className="w-3 h-3" />
                  {m.attachmentCount} attachment{m.attachmentCount === 1 ? "" : "s"} (open in Chat to view)
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lets a person attach a thread: search threads nobody has linked yet, or paste a thread link. */
function LinkThreadForm({ customerId, customerName, onLinked }: { customerId: string; customerName: string; onLinked: () => void }) {
  const [query, setQuery] = useState(customerName);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/threads?q=${encodeURIComponent(query.trim())}`);
        setResults(res.ok ? await res.json() : []);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const link = async (thread: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/chat-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't link the thread");
      onLinked();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const looksLikeLink = /chat\.google\.com|mail\.google\.com|spaces\//.test(query);

  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-3">
      <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5 text-slate-500" />
        Link a site-visit thread
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search unlinked threads, or paste a thread link from Chat"
          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
      </div>
      {looksLikeLink && (
        <button
          onClick={() => link(query)}
          disabled={busy}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          Link this thread
        </button>
      )}
      {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {!looksLikeLink && results && (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-3">No unlinked threads match.</p>
          ) : (
            results.map((t) => (
              <div key={t.name} className="flex items-start justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-slate-800 line-clamp-2 break-words">{t.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {t.space?.displayName} · {t.messageCount} messages · last {formatTime(t.lastMessageAt)}
                  </p>
                </div>
                <button
                  onClick={() => link(t.name)}
                  disabled={busy}
                  className="shrink-0 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg"
                >
                  Link
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ChatThreadsPanel({ customer, onChanged }: { customer: any; onChanged: () => void }) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const threads: any[] = customer.chatThreads || [];

  const unlink = async (threadName: string) => {
    if (!confirm("Unlink this thread from this customer? It stays in Google Chat, and TalkCRM won't link it here again automatically.")) return;
    await fetch(`/api/customers/${customer.id}/chat-threads?thread=${encodeURIComponent(threadName)}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Site-visit notes from Google Chat. Threads are matched by the DTV account # or customer name in their first message.{" "}
          <Link href="/settings#google-chat" className="text-blue-600 underline">Chat settings</Link>
        </p>
        <button
          onClick={() => setShowLinkForm((v) => !v)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{showLinkForm ? "Done" : "Link a thread"}</span>
        </button>
      </div>

      {showLinkForm && (
        <LinkThreadForm
          customerId={customer.id}
          customerName={customer.accountNumber || customer.name}
          onLinked={() => {
            setShowLinkForm(false);
            onChanged();
          }}
        />
      )}

      {threads.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm space-y-1">
          <MessagesSquare className="w-6 h-6 text-slate-300 mx-auto" />
          <p>No site-visit threads linked to this customer yet.</p>
        </div>
      ) : (
        threads.map((t) => <ThreadCard key={t.name} thread={t} onUnlink={() => unlink(t.name)} />)
      )}
    </div>
  );
}
