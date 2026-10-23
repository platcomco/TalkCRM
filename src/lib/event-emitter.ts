import { EventEmitter } from "events";

type CallPayload = {
  id: string;
  callId?: string;
  fromNumber: string;
  formattedFrom: string;
  toExtension?: string;
  direction: string;
  status: "ringing" | "answered" | "completed" | "missed";
  timestamp: string;
  customer?: {
    id: string;
    name: string;
    companyName?: string | null;
    email?: string | null;
    qboBalance?: number | null;
    openInvoicesCount?: number;
    customerType?: string | null;
    accountNumber?: string | null;
    parentName?: string | null;
    otherMatches?: number; // other customers sharing this phone number
  } | null;
};

class CallEventManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  emitCall(event: "incoming_call" | "call_updated" | "call_ended", payload: CallPayload) {
    this.emit(event, payload);
    this.emit("any_call", { event, payload });
  }
}

declare global {
  var callEventManager: CallEventManager | undefined;
}

// Always share one instance through globalThis: the webhook route and the SSE route may be
// bundled separately, and each must see the same emitter or screen-pops silently stop.
export const callEvents = global.callEventManager || new CallEventManager();
global.callEventManager = callEvents;

export type { CallPayload };
