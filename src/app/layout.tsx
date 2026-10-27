import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { CallScreenPop } from "@/components/CallScreenPop";
import { AppFooter } from "@/components/AppFooter";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TalkCRM · Platinum Communication",
  description: "Self-hosted CRM with real-time UniFi Talk call screen-pops, QuickBooks customer billing, and Gmail conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Bottom padding on phones keeps content clear of the bottom navigation bar */}
      <body className={`${inter.className} min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-16 md:pb-0`}>
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <AppFooter />
        <CallScreenPop />
      </body>
    </html>
  );
}
