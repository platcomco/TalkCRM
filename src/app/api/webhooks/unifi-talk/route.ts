import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhoneNumber, extractDigits, formatPhoneDisplay } from "@/lib/phone-utils";
import { callEvents } from "@/lib/event-emitter";

export async function POST(req: NextRequest) {
  try {
    // Secret verification: UniFi Talk sends the configured secret in the x-unifi-secret header.
    // This route is public, so with no secret configured it refuses everything (fail closed);
    // only local testing with ENABLE_AUTH=false accepts unsigned calls.
    const secret = process.env.UNIFI_TALK_WEBHOOK_SECRET;
    if (!secret && process.env.ENABLE_AUTH !== "false") {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
    }
    if (secret && req.headers.get("x-unifi-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }

    const body = await req.json();

    // UniFi Talk payload (confirmed from live calls):
    // { event: "call_started" | "call_answered" | "call_completed" | "call_cancelled" | "call_failed", call_id,
    //   direction: "in" | "out", caller_number, dialed_number, caller_name?, timestamp: ms }
    // Inbound:  caller_number = outside caller (+1817...), dialed_number = our DID
    // Outbound: caller_number = our extension (e.g. "1001"), dialed_number = outside number
    const callId = String(body.call_id || `call_${Date.now()}`);
    const rawEvent = String(body.event || "").toLowerCase();
    const eventTime = typeof body.timestamp === "number" ? new Date(body.timestamp) : new Date();
    const direction = body.direction === "out" ? "outbound" : "inbound";

    // The call log stores the outside party as fromNumber and our side (DID or extension) as
    // toExtension, so customer matching and every call list show the customer's number either way
    const callerNumber = String(body.caller_number || "");
    const dialedNumber = String(body.dialed_number || "");
    const remoteNumber = direction === "outbound" ? dialedNumber : callerNumber;
    const localNumber = direction === "outbound" ? callerNumber : dialedNumber;

    // Internal calls (extension to extension, e.g. 1001 → 1003) and feature codes (*97) aren't
    // customer calls: skip them rather than logging an "Unknown" caller. A blocked caller ID
    // (no digits at all) is still a real outside call and is kept.
    const internal = /^[*#]?\d{1,6}$/.test(remoteNumber.trim());

    // Record every event received (no phone numbers) so a call that never ended can be traced
    console.log("[unifi-talk webhook]", JSON.stringify({ event: rawEvent, callId, direction, internal }));

    if (internal) {
      return NextResponse.json({ success: true, ignored: "internal call" });
    }

    const existing = await db.callLog.findUnique({ where: { callId } });

    let status: "ringing" | "answered" | "completed" | "missed";
    let answeredAt: Date | undefined;
    let duration = 0;
    if (rawEvent.includes("start") || rawEvent.includes("ring")) {
      status = "ringing";
    } else if (rawEvent.includes("answer")) {
      status = "answered";
      answeredAt = eventTime;
    } else if (
      rawEvent.includes("miss") ||
      rawEvent.includes("abandon") ||
      rawEvent.includes("cancel") ||
      rawEvent.includes("fail")
    ) {
      status = "missed";
    } else if (rawEvent.includes("complete") || rawEvent.includes("end") || rawEvent.includes("hangup")) {
      // A call that ends without ever being answered is a missed call
      if (existing?.answeredAt) {
        status = "completed";
        duration = Math.max(0, Math.round((eventTime.getTime() - existing.answeredAt.getTime()) / 1000));
      } else {
        status = "missed";
      }
    } else {
      // Unknown event type (e.g. SMS or other Talk events): log its name and field names only
      // (no numbers or message text) so new event types can be supported, and leave calls untouched
      console.log("[unifi-talk webhook] ignored event", JSON.stringify({ event: rawEvent, fields: Object.keys(body) }));
      return NextResponse.json({ success: true, ignored: rawEvent || "missing event" });
    }

    const normalizedFrom = normalizePhoneNumber(remoteNumber);
    const digits = extractDigits(remoteNumber);
    // Match on the 10-digit national number, which every stored phone format contains
    const matchDigits = digits.length >= 10 ? digits.slice(-10) : digits;

    // Lookup customer in database by normalized phone or digits. Several accounts can share a
    // number (e.g. QuickBooks sub-clients of one parent): keep the customer already linked to this
    // call, then the customer this number's last call went to, then a top-level account, and
    // report how many others share the number.
    let customer: any = null;
    let otherMatches = 0;
    if (matchDigits.length >= 7) {
      const candidates = await db.customer.findMany({
        where: {
          OR: [
            { normalizedPhones: { contains: matchDigits } },
            { primaryPhone: { contains: matchDigits } },
            { mobilePhone: { contains: matchDigits } },
          ],
        },
        include: {
          invoices: {
            where: { status: { in: ["Open", "Overdue"] } },
          },
          estimates: { orderBy: { txnDate: "desc" } },
        },
        orderBy: { name: "asc" },
        take: 50,
      });

      // Whoever this number's previous call was linked to (e.g. a contact someone created for
      // this caller) is the best guess when the number is shared
      const previousCall =
        candidates.length > 1
          ? await db.callLog.findFirst({
              where: { normalizedFrom: { endsWith: matchDigits }, customerId: { in: candidates.map((c) => c.id) } },
              orderBy: { timestamp: "desc" },
              select: { customerId: true },
            })
          : null;

      customer =
        candidates.find((c) => c.id === existing?.customerId) ||
        candidates.find((c) => c.id === previousCall?.customerId) ||
        candidates.find((c) => !c.parentName) ||
        candidates[0] ||
        null;
      otherMatches = Math.max(0, candidates.length - 1);
    }

    // Upsert Call Log in database
    const callLog = await db.callLog.upsert({
      where: { callId },
      update: {
        status,
        duration: duration || undefined,
        answeredAt,
        customerId: customer ? customer.id : undefined,
      },
      create: {
        callId,
        fromNumber: remoteNumber || "Unknown",
        normalizedFrom: normalizedFrom || digits || "unknown",
        toExtension: localNumber || null,
        direction,
        status,
        duration,
        timestamp: eventTime,
        answeredAt,
        customerId: customer ? customer.id : null,
      },
    });

    const callPayload = {
      id: callLog.id,
      callId,
      fromNumber: remoteNumber || "Unknown",
      formattedFrom: formatPhoneDisplay(remoteNumber || digits),
      toExtension: localNumber,
      direction: callLog.direction,
      status,
      timestamp: callLog.timestamp.toISOString(),
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            companyName: customer.companyName,
            email: customer.email,
            qboBalance: customer.qboBalance,
            openInvoicesCount: customer.invoices?.length || 0,
            // Pending/Accepted quotes: likely what they're calling about, and a chance to review old ones
            openEstimates: (customer.estimates || []).slice(0, 5).map((e: any) => ({
              qboEstimateId: e.qboEstimateId,
              docNumber: e.docNumber,
              totalAmount: e.totalAmount,
              status: e.status,
              txnDate: e.txnDate,
              expirationDate: e.expirationDate,
              summary: e.summary,
            })),
            openEstimatesCount: customer.estimates?.length || 0,
            customerType: customer.customerType,
            accountNumber: customer.accountNumber,
            parentName: customer.parentName,
            otherMatches,
          }
        : null,
    };

    // Broadcast live event to open browser tabs
    // Only inbound calls pop up; an outbound call's "ringing" is our own staff dialing out
    if (status === "ringing" && direction === "inbound") {
      callEvents.emitCall("incoming_call", callPayload);
    } else if (status === "completed" || status === "missed") {
      callEvents.emitCall("call_ended", callPayload);
    } else {
      callEvents.emitCall("call_updated", callPayload);
    }

    return NextResponse.json({
      success: true,
      callId,
      status,
      matchedCustomer: customer ? { id: customer.id, name: customer.name } : null,
    });
  } catch (err: any) {
    console.error("Error processing UniFi Talk webhook:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "UniFi Talk webhook receiver is active. Send POST requests with PBX call events.",
  });
}
