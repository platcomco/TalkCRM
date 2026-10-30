import { db } from "./db";
import { getQboConnection, syncQboCustomers } from "./quickbooks";
import { syncAllChatSpaces } from "./google-chat";

const MINUTE = 60 * 1000;
const QBO_INTERVAL = 30 * MINUTE;
const CHAT_INTERVAL = 10 * MINUTE;

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
  console.log("[scheduler] background sync started (QuickBooks every 30 min in business hours, Chat every 10 min)");
}
