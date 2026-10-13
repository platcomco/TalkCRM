"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PhoneCall, ShieldCheck, AlertCircle, Lock } from "lucide-react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const rejectedEmail = searchParams.get("email");

  const getErrorMessage = () => {
    switch (error) {
      case "unauthorized_domain":
        return rejectedEmail
          ? `Access denied for ${rejectedEmail}. Only authorized company email accounts are permitted.`
          : "Your Google account domain is not authorized. Please use your company Google Workspace email.";
      case "missing_credentials":
        return "Google OAuth credentials are missing from the server configuration. Please check GOOGLE_CLIENT_ID in your .env file.";
      case "missing_client_id":
        return "GOOGLE_CLIENT_ID is not configured in the server environment.";
      case "access_denied":
        return "Google sign-in was canceled.";
      default:
        return error ? `Login error: ${decodeURIComponent(error)}` : null;
    }
  };

  const errorMessage = getErrorMessage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-2xl border border-slate-100">
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-blue-600 items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <PhoneCall className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">TalkCRM</h1>
          <p className="text-xs text-slate-500">
            UniFi Talk Telephony & QuickBooks Customer Portal
          </p>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4 pt-2">
          <a
            href="/api/auth/login"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-300 rounded-xl shadow-sm text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google Workspace</span>
          </a>

          <div className="text-center pt-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Lock className="w-3 h-3" />
              <span>Protected by company Google OAuth & PBX security</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginContent />
    </Suspense>
  );
}
