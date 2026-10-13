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

export const callEvents = global.callEventManager || new CallEventManager();

if (process.env.NODE_ENV !== "production") {
  global.callEventManager = callEvents;
}

export type { CallPayload };
