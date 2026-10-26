"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPublicPage } from "@/lib/public-pages";
import { LEGAL_CONTACT_EMAIL } from "@/components/LegalPage";

/** Support contact and legal links on every app page (public pages have their own). */
export function AppFooter() {
  if (isPublicPage(usePathname())) return null;

  return (
    <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>
        Need help? Email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=TalkCRM%20support`} className="text-blue-600 hover:underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
      </span>
      <Link href="/terms" className="hover:text-blue-600">Terms of Use</Link>
      <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
    </footer>
  );
}
