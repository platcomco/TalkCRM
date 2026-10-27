"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Settings,
  ShieldCheck,
  Radio,
  DollarSign,
  Mail,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { ChatSpacesSettings } from "@/components/ChatSpacesSettings";

function SettingsContent() {
  const searchParams = useSearchParams();
  const successParam = searchParams.get("success");
  const errorParam = searchParams.get("error");

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopyUrl = () => {
    if (!status?.unifiTalk?.webhookUrl) return;
    navigator.clipboard.writeText(status.unifiTalk.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSyncQbo = async () => {
    setIsSyncing(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/integrations/quickbooks/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(
          `QuickBooks sync complete! Synced ${data.syncedCount || 0} customers and ${data.invoiceCount || 0} open invoices.` +
            (data.mergedCount ? ` Merged ${data.mergedCount} TalkCRM contact(s) into their new QuickBooks record.` : "") +
            (data.linkedCalls ? ` Linked ${data.linkedCalls} earlier call(s).` : "")
        );
      } else {
        setActionMessage(`Sync notice: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectQbo = async () => {
    if (!confirm("Disconnect QuickBooks? TalkCRM will stop syncing until someone connects it again. Customers already synced stay in TalkCRM.")) {
      return;
    }
    setActionMessage(null);
    try {
      const res = await fetch("/api/integrations/quickbooks/disconnect", { method: "POST" });
      const data = await res.json();
      setActionMessage(res.ok ? "QuickBooks disconnected." : `Disconnect failed: ${data.error}`);
      fetchStatus();
    } catch (err: any) {
      setActionMessage(`Disconnect failed: ${err.message}`);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("Disconnect your Google account? Gmail lookups stop for you, and any Chat spaces you added stop syncing until someone re-adds them.")) {
      return;
    }
    setActionMessage(null);
    try {
      const res = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      const data = await res.json();
      setActionMessage(res.ok ? "Google disconnected." : `Disconnect failed: ${data.error}`);
      fetchStatus();
    } catch (err: any) {
      setActionMessage(`Disconnect failed: ${err.message}`);
    }
  };

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/integrations/seed-demo", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActionMessage("Demo sample data refreshed successfully!");
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading integration settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <span>Integration Settings & Credentials</span>
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure UniFi Talk PBX webhooks, QuickBooks Online accounting sync, and Google Workspace email lookup.
        </p>
      </div>

      {/* Status Banners */}
      {successParam && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Successfully connected integration: {successParam.replace("_", " ").toUpperCase()}</span>
        </div>
      )}
      {errorParam && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>Integration notice: {decodeURIComponent(errorParam)}</span>
        </div>
      )}
      {actionMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-blue-600" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Section 1: UniFi Talk PBX */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">UniFi Talk PBX Webhook</h2>
              <p className="text-xs text-slate-500">Listens for inbound/outbound calls from your UniFi OS Console.</p>
            </div>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
            Endpoint Ready
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Webhook URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={status?.unifiTalk?.webhookUrl || "http://localhost:3000/api/webhooks/unifi-talk"}
                className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg font-mono text-slate-800 select-all"
              />
              <button
                onClick={handleCopyUrl}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              UniFi Talk can also post straight to the server on the LAN (e.g. <code>http://10.30.46.200:3050/api/webhooks/unifi-talk</code>).
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h3 className="font-bold text-slate-900">UniFi Talk webhook settings:</h3>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>Events: call started, answered, completed, cancelled and failed.</li>
              <li>Authentication: <strong>Custom Header</strong> named <code>x-unifi-secret</code>, set to the server&apos;s <code>UNIFI_TALK_WEBHOOK_SECRET</code>{status?.unifiTalk?.hasSecret ? " (configured)" : " (not configured on the server!)"}.</li>
              <li>Internal extension-to-extension calls are ignored.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Section 2: QuickBooks Online */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">QuickBooks Online (QBO)</h2>
              <p className="text-xs text-slate-500">Syncs customer accounts, phone numbers, balances, and invoices.</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            status?.quickbooks?.connected
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {status?.quickbooks?.connected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {status?.quickbooks?.authUrl ? (
              <a
                href={status.quickbooks.authUrl}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm"
              >
                <span>Connect to QuickBooks</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                disabled
                className="bg-slate-200 text-slate-500 font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
                title="Add QBO_CLIENT_ID to .env to enable OAuth"
              >
                Connect to QuickBooks (Needs Client ID in .env)
              </button>
            )}

            <button
              onClick={handleSyncQbo}
              disabled={isSyncing}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Customers Now"}</span>
            </button>

            {status?.quickbooks?.connected && (
              <button
                onClick={handleDisconnectQbo}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold px-3 py-2 rounded-lg transition"
              >
                Disconnect QuickBooks
              </button>
            )}
          </div>

          {status?.quickbooks?.connected && (
            <p className="text-slate-600">
              Last synced:{" "}
              <strong>
                {status.quickbooks.lastSyncedAt ? new Date(status.quickbooks.lastSyncedAt).toLocaleString() : "never"}
              </strong>
              {status?.autoSync && " · syncs automatically every 30 minutes, Mon–Sat 7am–7pm"}
            </p>
          )}
          <p className="text-slate-500 text-[11px]">
            To connect your live QuickBooks Online account, create an app at{" "}
            <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
              developer.intuit.com
            </a>
            , set Redirect URI to <code>{status?.quickbooks?.redirectUri || "(loading...)"}</code> exactly, and add your <code>QBO_CLIENT_ID</code> and <code>QBO_CLIENT_SECRET</code> to your <code>.env</code> file.
          </p>
        </div>
      </div>

      {/* Section 3: the signed-in person's own Google account (Gmail + Chat) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">My Google Account (Gmail & Chat)</h2>
              <p className="text-xs text-slate-500">
                Each person connects their own account. Customer pages then show emails from your own mailbox.
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${
            status?.google?.connected
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {status?.google?.connected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <div className="space-y-3 text-xs">
          {status?.google?.signedInAs && (
            <p className="text-slate-600">
              Signed in as <strong>{status.google.signedInAs}</strong>
              {status.google.connected && (
                <>
                  {" "}· Gmail {status.google.gmail ? "✓" : "✗"} · Chat {status.google.chat ? "✓" : "✗"}
                </>
              )}
            </p>
          )}
          {status?.google?.connected && !(status.google.gmail && status.google.chat) && (
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Some access is missing (it was unticked on Google&apos;s consent screen). Reconnect and leave every box ticked.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {status?.google?.authUrl ? (
              <a
                href={status.google.authUrl}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 transition shadow-sm"
              >
                <span>{status.google.connected ? "Reconnect My Google Account" : "Connect My Google Account"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                disabled
                className="bg-slate-200 text-slate-500 font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
                title="Add GOOGLE_CLIENT_ID to .env to enable OAuth"
              >
                Connect Google (Needs Client ID in .env)
              </button>
            )}
            {status?.google?.connected && (
              <button
                onClick={handleDisconnectGoogle}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold px-3 py-2 rounded-lg transition"
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="text-slate-500 text-[11px]">
            Google Cloud setup: OAuth redirect URI <code>{status?.google?.redirectUri || "(loading...)"}</code>; Gmail API and
            Google Chat API enabled; Chat API &rarr; Configuration filled in.
          </p>
        </div>
      </div>

      {/* Section 4: Google Chat spaces with site-visit threads */}
      <ChatSpacesSettings chatConnected={!!status?.google?.chat} autoSync={!!status?.autoSync} />

      {/* Section 4: Demo Data & Testing Sandbox (only when ENABLE_DEMO_DATA=true) */}
      {status?.demoDataEnabled && (
      <div className="bg-slate-900 text-white rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-bold text-white text-base">Development & Testing Sandbox</h2>
              <p className="text-xs text-slate-400">Load sample customers with QuickBooks balances, open invoices, and call history.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedDemo}
            disabled={isSeeding}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSeeding ? "Refreshing..." : "Reset / Seed Demo Data"}</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500 text-sm">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
