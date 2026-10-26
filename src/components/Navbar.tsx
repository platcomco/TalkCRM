"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { PhoneCall, Users, Settings, Search, Radio, BellRing, LogOut, User as UserIcon } from "lucide-react";
import { isPublicPage } from "@/lib/public-pages";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedMessage, setSimulatedMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Only fetch auth on app pages (public pages have no session)
    if (!isPublicPage(pathname)) {
      fetch("/api/auth/me")
        .then((res) => res.json())
        .then((data) => {
          if (data?.user) {
            setCurrentUser(data.user);
          }
        })
        .catch(() => {});
    }
  }, [pathname]);

  if (isPublicPage(pathname)) {
    return null;
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/customers?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSimulateCall = async (phone: string = "5552345678") => {
    setIsSimulating(true);
    setSimulatedMessage(null);
    try {
      const res = await fetch("/api/webhooks/unifi-talk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-unifi-secret": "talkcrm-secret-token",
        },
        body: JSON.stringify({
          event: "call.start",
          status: "ringing",
          caller: phone,
          caller_id_number: phone,
          callee: "101",
          direction: "inbound",
          call_id: `sim_${Date.now()}`,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      setSimulatedMessage(`Call pop triggered for ${phone}!`);
      setTimeout(() => setSimulatedMessage(null), 3000);
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const navItems = [
    { label: "Dashboard", href: "/", icon: PhoneCall },
    { label: "Calls", href: "/calls", icon: Radio },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight text-slate-900 tracking-tight">TalkCRM</span>
                <span className="text-[10px] text-blue-600 font-medium tracking-wider uppercase">UniFi + QuickBooks</span>
              </div>
            </Link>

            {/* Main Nav */}
            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center space-x-3">
            <form onSubmit={handleSearch} className="relative hidden sm:block w-64">
              <input
                type="text"
                placeholder="Search name, phone, DTV acct #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
            </form>

            {/* Test Call Trigger */}
            <button
              onClick={() => handleSimulateCall("5552345678")}
              disabled={isSimulating}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              title="Trigger a simulated incoming UniFi Talk call from Marcus Vance"
            >
              <BellRing className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isSimulating ? "Ringing..." : "Test Call Pop"}</span>
            </button>

            {/* PBX Live Status Indicator */}
            <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 rounded-full border border-slate-200 text-[11px] font-medium text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>PBX:</span>
              <span className="text-emerald-700 font-semibold">Active</span>
            </div>

            {/* Employee Profile & Logout */}
            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                {currentUser.picture ? (
                  <img
                    src={currentUser.picture}
                    alt={currentUser.name}
                    className="w-7 h-7 rounded-full border border-slate-300"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    {currentUser.name?.charAt(0) || "U"}
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-700 hidden xl:inline">
                  {currentUser.name}
                </span>
                <a
                  href="/api/auth/logout"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      {simulatedMessage && (
        <div className="bg-emerald-600 text-white text-xs py-1 text-center font-medium transition-all">
          {simulatedMessage}
        </div>
      )}
    </header>
  );
}
