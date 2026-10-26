import Link from "next/link";
import { PhoneCall } from "lucide-react";

export const LEGAL_EFFECTIVE_DATE = "October 26, 2026";
export const LEGAL_CONTACT_EMAIL = "james@platinumcom.co";

/** Shared layout for the public Terms and Privacy pages (no login required). */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
          <PhoneCall className="w-5 h-5" />
        </div>
        <span className="font-bold text-slate-900 text-lg">TalkCRM</span>
      </div>

      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-slate-700 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <header className="space-y-1 pb-2 border-b border-slate-100">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-xs text-slate-500">Effective {LEGAL_EFFECTIVE_DATE}</p>
        </header>
        {children}
      </article>

      <nav className="flex gap-4 text-xs text-slate-500 mt-4 justify-center">
        <Link href="/terms" className="hover:text-blue-600">Terms of Use</Link>
        <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
        <Link href="/login" className="hover:text-blue-600">Staff sign-in</Link>
      </nav>
    </div>
  );
}
