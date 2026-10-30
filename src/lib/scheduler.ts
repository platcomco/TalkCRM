import { db } from "./db";
import { getQboConnection, syncQboCustomers } from "./quickbooks";
import { syncAllChatSpaces } from "./google-chat";
import { callEvents } from "./event-emitter";
import { formatPhoneDisplay } from "./phone-utils";

const MINUTE = 60 * 1000;
const QBO_INTERVAL = 30 * MINUTE;
const CHAT_INTERVAL = 10 * MINUTE;
const STALE_CALL_INTERVAL = MINUTE;
// Longer than any call should ring; UniFi Talk's end event is the normal way out of "ringing"
const STALE_RINGING_AGE = 10 * MINUTE;

/** QuickBooks syncs during business hours only (server time zone, TZ): Mon–Sat 7am–7pm. */
function isBusinessHours(now: Date): boolean {
  const day = now.getDay(); // 0 = Sunday
  const hour = now.getHours();
  return day !== 0 && hour >= 7 && hour < 19;
}

async function runQboSync() {
  if (!isBusinessHours(new Date())) return;
  const connection = await getQboConnection();
  if (!connection?.refreshToken) return;
  try {
    const r = await syncQboCustomers();
    console.log(
      `[scheduler] QuickBooks sync: ${r.syncedCount} customers, ${r.invoiceCount} open invoices, ${r.estimateCount} open estimates, ${r.mergedCount} merged, ${r.linkedCalls} calls linked`
    );
  } catch (err: any) {
    console.error("[scheduler] QuickBooks sync failed:", err?.message || err);
  }
}

async function runChatSync() {
  if ((await db.chatSpace.count()) === 0) return;
  try {
    const r = await syncAllChatSpaces();
    console.log(`[scheduler] Chat sync: ${r.spaces} spaces, ${r.messages} messages, ${r.linked} threads auto-linked`);
    for (const e of r.errors) console.error(`[scheduler] Chat sync error: ${e}`);
  } catch (err: any) {
    console.error("[scheduler] Chat sync failed:", err?.message || err);
  }
}

/** If UniFi Talk's end event never arrives a call would ring forever: close it out as missed. */
async function closeStaleRingingCalls() {
  try {
    const stale = await db.callLog.findMany({
      where: { status: "ringing", timestamp: { lt: new Date(Date.now() - STALE_RINGING_AGE) } },
    });
    for (const call of stale) {
      // Skip a call whose real event landed since the query above
      const { count } = await db.callLog.updateMany({
        where: { id: call.id, status: "ringing" },
        data: { status: "missed" },
      });
      if (count === 0) continue;
      console.log("[scheduler] Marked stale ringing call missed", JSON.stringify({ callId: call.callId }));
      callEvents.emitCall("call_ended", {
        id: call.id,
        callId: call.callId || undefined,
        fromNumber: call.fromNumber,
        formattedFrom: formatPhoneDisplay(call.fromNumber),
        toExtension: call.toExtension || undefined,
        direction: call.direction,
        status: "missed",
        timestamp: call.timestamp.toISOString(),
      });
    }
  } catch (err: any) {
    console.error("[scheduler] Stale call cleanup failed:", err?.message || err);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var talkcrmSchedulerStarted: boolean | undefined;
}

/** Starts background syncs once per server process. Set AUTO_SYNC=false to turn them off. */
export function startScheduler() {
  if (process.env.AUTO_SYNC === "false" || global.talkcrmSchedulerStarted) return;
  global.talkcrmSchedulerStarted = true;

  // First run shortly after startup (gives `prisma db push` and the server time to settle)
  setTimeout(() => {
    runQboSync();
    runChatSync();
  }, MINUTE);
  setInterval(runQboSync, QBO_INTERVAL);
  setInterval(runChatSync, CHAT_INTERVAL);
  setInterval(closeStaleRingingCalls, STALE_CALL_INTERVAL);
  console.log("[scheduler] background sync started (QuickBooks every 30 min in business hours, Chat every 10 min, stale calls every minute)");
}
