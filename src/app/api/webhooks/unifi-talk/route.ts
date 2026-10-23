import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhoneNumber, extractDigits, formatPhoneDisplay } from "@/lib/phone-utils";
import { callEvents } from "@/lib/event-emitter";

export async function POST(req: NextRequest) {
  try {
    // Secret verification: UniFi Talk sends the configured secret in the x-unifi-secret header.
    // When a secret is configured, requests without it are rejected too.
    const secret = process.env.UNIFI_TALK_WEBHOOK_SECRET;
    if (secret && req.headers.get("x-unifi-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
    }

    const body = await req.json();

    // Log the raw payload until the UniFi Talk webhook format is confirmed.
    // Header names only (not values) so the shared secret never lands in logs.
    console.log(
      "[unifi-talk webhook]",
      JSON.stringify({
        headers: Array.from(req.headers.keys()),
        query: Array.from(req.nextUrl.searchParams.keys()),
        body,
      })
    );

    // UniFi Talk payload (confirmed from live calls):
    // { event: "call_started" | "call_answered" | "call_completed", call_id, direction: "in" | "out",
    //   caller_number: "+1817...", dialed_number: "+1817...", caller_name? (on completed), timestamp: ms }
    const callId = String(body.call_id || `call_${Date.now()}`);
    const rawEvent = String(body.event || "").toLowerCase();
    const eventTime = typeof body.timestamp === "number" ? new Date(body.timestamp) : new Date();
    const direction = body.direction === "out" ? "outbound" : "inbound";

    const rawFrom = String(body.caller_number || "");
    const toExtension = String(body.dialed_number || "");
    // The customer is the far end: the caller on inbound calls, the dialed number on outbound calls
    const remoteNumber = direction === "outbound" ? toExtension : rawFrom;

    const existing = await db.callLog.findUnique({ where: { callId } });

    let status: "ringing" | "answered" | "completed" | "missed";
    let answeredAt: Date | undefined;
    let duration = 0;
    if (rawEvent.includes("start") || rawEvent.includes("ring")) {
      status = "ringing";
    } else if (rawEvent.includes("answer")) {
      status = "answered";
      answeredAt = eventTime;
    } else if (rawEvent.includes("miss") || rawEvent.includes("abandon") || rawEvent.includes("cancel")) {
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
      // Unknown event type: keep it in the log but don't change the call's status
      return NextResponse.json({ success: true, ignored: rawEvent || "missing event" });
    }

    const normalizedFrom = normalizePhoneNumber(remoteNumber);
    const digits = extractDigits(remoteNumber);
    // Match on the 10-digit national number, which every stored phone format contains
    const matchDigits = digits.length >= 10 ? digits.slice(-10) : digits;

    // Lookup customer in database by normalized phone or digits
    let customer: any = null;
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
        },
        take: 1,
      });

      if (candidates.length > 0) {
        customer = candidates[0];
      }
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
        fromNumber: rawFrom || "Unknown",
        normalizedFrom: normalizedFrom || digits || "unknown",
        toExtension: toExtension || null,
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
      fromNumber: rawFrom || "Unknown",
      formattedFrom: formatPhoneDisplay(remoteNumber || digits),
      toExtension,
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
