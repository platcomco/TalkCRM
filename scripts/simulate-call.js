/**
 * Script to simulate a UniFi Talk PBX webhook call event.
 * Usage:
 *   node scripts/simulate-call.js [phone] [status]
 * Examples:
 *   node scripts/simulate-call.js 5552345678 ringing
 *   node scripts/simulate-call.js 5552345678 answered
 *   node scripts/simulate-call.js 5552345678 completed 120
 */

const phone = process.argv[2] || "5552345678"; // Marcus Vance
const status = process.argv[3] || "ringing";
const duration = parseInt(process.argv[4] || "0", 10);

const payload = {
  event: status === "ringing" ? "call.start" : `call.${status}`,
  status: status,
  caller: phone,
  caller_id_number: phone,
  callee: "101",
  to: "101",
  direction: "inbound",
  call_id: `test_call_${Date.now()}`,
  duration: duration,
  timestamp: new Date().toISOString(),
};

async function run() {
  const url = "http://localhost:3000/api/webhooks/unifi-talk";
  console.log(`\nSimulating UniFi Talk PBX Webhook:`);
  console.log(`POST ${url}`);
  console.log(`Payload:`, JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-unifi-secret": "talkcrm-secret-token",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`\nResponse [${res.status}]:`, data);
    console.log(`\nSuccess! Check your browser dashboard at http://localhost:3000 to see the call screen-pop.`);
  } catch (err) {
    console.error("Failed to send webhook. Make sure the CRM server is running on http://localhost:3000:", err.message);
  }
}

run();
