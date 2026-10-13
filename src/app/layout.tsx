import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { CallScreenPop } from "@/components/CallScreenPop";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TalkCRM - UniFi Talk PBX & QuickBooks Online CRM",
  description: "Self-hosted CRM with real-time UniFi Talk call screen-pops, QuickBooks customer billing, and Gmail conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col bg-slate-50 text-slate-900`}>
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <CallScreenPop />
      </body>
    </html>
  );
}
