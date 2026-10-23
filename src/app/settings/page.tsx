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
        setActionMessage(`QuickBooks sync complete! Synced ${data.syncedCount || 0} customers and ${data.invoiceCount || 0} open invoices.`);
      } else {
        setActionMessage(`Sync notice: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
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
              Replace <code>localhost</code> with your Docker host machine&apos;s LAN IP (e.g. <code>192.168.1.50</code>) so your UniFi Talk PBX can reach it over the local network.
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h3 className="font-bold text-slate-900">How to configure in UniFi Talk:</h3>
            <ol className="list-decimal list-inside space-y-1 text-slate-600">
              <li>Log in to your UniFi OS Console (UDM Pro / Cloud Gateway).</li>
              <li>Open the <strong>Talk</strong> application &rarr; click <strong>Settings</strong> &rarr; <strong>System</strong> (or <strong>Integrations</strong>).</li>
              <li>Look for <strong>Webhooks</strong> / <strong>Third-Party CRM Integration</strong>.</li>
              <li>Paste the Webhook URL above, set method to <strong>POST</strong>, and save.</li>
            </ol>
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
          </div>

          <p className="text-slate-500 text-[11px]">
            To connect your live QuickBooks Online account, create an app at{" "}
            <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
              developer.intuit.com
            </a>
            , set Redirect URI to <code>{status?.quickbooks?.redirectUri || "(loading...)"}</code> exactly, and add your <code>QBO_CLIENT_ID</code> and <code>QBO_CLIENT_SECRET</code> to your <code>.env</code> file.
          </p>
        </div>
      </div>

      {/* Section 3: Google Workspace (Gmail) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Google Workspace / Gmail</h2>
              <p className="text-xs text-slate-500">Fetches customer email conversations on demand.</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            status?.google?.connected
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {status?.google?.connected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            {status?.google?.authUrl ? (
              <a
                href={status.google.authUrl}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5 transition shadow-sm"
              >
                <span>Connect Google Workspace</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                disabled
                className="bg-slate-200 text-slate-500 font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
                title="Add GOOGLE_CLIENT_ID to .env to enable OAuth"
              >
                Connect Google Workspace (Needs Client ID in .env)
              </button>
            )}
          </div>
          <p className="text-slate-500 text-[11px]">
            To connect Gmail, create OAuth credentials in{" "}
            <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
              Google Cloud Console
            </a>
            , set Redirect URI to <code>{status?.google?.redirectUri || "(loading...)"}</code> exactly, and add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your <code>.env</code> file.
          </p>
        </div>
      </div>

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
