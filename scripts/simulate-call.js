/**
 * Script to simulate a UniFi Talk PBX call, sending the same webhook events Talk sends
 * (call_started -> call_answered -> call_completed).
 * Usage:
 *   node scripts/simulate-call.js [phone] [answered|missed|ringing] [talkSeconds]
 * Examples:
 *   node scripts/simulate-call.js +15552345678              # answered, 45s talk time
 *   node scripts/simulate-call.js +15552345678 answered 120
 *   node scripts/simulate-call.js +15552345678 missed       # rings, caller hangs up
 *   node scripts/simulate-call.js +15552345678 ringing      # only the screen-pop
 * Env: TALKCRM_URL (default http://localhost:3050), UNIFI_TALK_WEBHOOK_SECRET
 */

const phone = process.argv[2] || "+15552345678"; // Marcus Vance (demo data)
const scenario = process.argv[3] || "answered";
const talkSeconds = parseInt(process.argv[4] || "45", 10);

const baseUrl = process.env.TALKCRM_URL || "http://localhost:3050";
const secret = process.env.UNIFI_TALK_WEBHOOK_SECRET || "talkcrm-secret-token";
const url = `${baseUrl}/api/webhooks/unifi-talk`;

const callId = crypto.randomUUID();
const start = Date.now();

const base = {
  call_id: callId,
  direction: "in",
  caller_number: phone,
  dialed_number: "+18175511000",
};

const events = [{ ...base, event: "call_started", timestamp: start }];
if (scenario === "answered") {
  events.push({ ...base, event: "call_answered", timestamp: start + 4000 });
  events.push({ ...base, event: "call_completed", timestamp: start + 4000 + talkSeconds * 1000 });
} else if (scenario === "missed") {
  events.push({ ...base, event: "call_completed", timestamp: start + 15000 });
}

async function run() {
  console.log(`\nSimulating UniFi Talk call ${callId} -> POST ${url}`);

  for (const payload of events) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-unifi-secret": secret,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log(`${payload.event} -> [${res.status}]`, JSON.stringify(data));
    } catch (err) {
      console.error(`Failed to send webhook. Make sure the CRM server is running on ${baseUrl}:`, err.message);
      return;
    }
    // Leave the screen-pop visible for a moment between events
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone. Check ${baseUrl}/calls for the result.`);
}

run();
