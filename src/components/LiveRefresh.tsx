"use client";

import { useRouter } from "next/navigation";
import { useCallsChanged } from "@/lib/live-calls";

/**
 * Drop into a server-rendered page to re-render it in place (no full reload)
 * whenever call activity changes.
 */
export function LiveRefresh() {
  const router = useRouter();
  useCallsChanged(() => router.refresh());
  return null;
}
