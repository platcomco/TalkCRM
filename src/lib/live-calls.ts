"use client";

import { useEffect, useRef } from "react";

/**
 * Browser-side signal that call data changed. CallScreenPop (which owns the single SSE
 * connection) dispatches it for every call event and after a reconnect, so pages can
 * refresh without each opening their own stream.
 */
export const CALLS_CHANGED_EVENT = "talkcrm:calls-changed";

export type CallsChangedDetail = {
  // Customer the call belongs to; undefined means "anything may have changed" (e.g. reconnect)
  customerId?: string | null;
};

export function notifyCallsChanged(detail: CallsChangedDetail = {}) {
  window.dispatchEvent(new CustomEvent<CallsChangedDetail>(CALLS_CHANGED_EVENT, { detail }));
}

/**
 * Runs `onChange` when call data changes or the tab becomes visible again.
 * Bursts (ringing -> answered -> completed) are coalesced into one refresh.
 */
export function useCallsChanged(onChange: (detail: CallsChangedDetail) => void, delayMs = 400) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (detail: CallsChangedDetail) => {
      clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(detail), delayMs);
    };

    const onCallsChanged = (e: Event) => schedule((e as CustomEvent<CallsChangedDetail>).detail || {});
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule({});
    };

    window.addEventListener(CALLS_CHANGED_EVENT, onCallsChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CALLS_CHANGED_EVENT, onCallsChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [delayMs]);
}
