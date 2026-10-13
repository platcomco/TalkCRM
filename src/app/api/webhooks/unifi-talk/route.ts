import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhoneNumber, extractDigits, formatPhoneDisplay } from "@/lib/phone-utils";
import { callEvents } from "@/lib/event-emitter";

export async function POST(req: NextRequest) {
  try {
    // Optional secret verification
    const secret = process.env.UNIFI_TALK_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret = req.headers.get("x-unifi-secret") || req.headers.get("x-webhook-secret");
      const authHeader = req.headers.get("authorization");
      const urlSecret = req.nextUrl.searchParams.get("secret");

      const passedSecret = headerSecret || urlSecret || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
      if (passedSecret && passedSecret !== secret) {
        return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
      }
    }

    const body = await req.json();

    // Extract caller number from various possible PBX payload formats
    const rawFrom =
      body.caller ||
      body.from ||
      body.caller_id_number ||
      body.caller_number ||
      body.source ||
      body.calling_number ||
      "";

    const toExtension = String(
      body.callee ||
      body.to ||
      body.extension ||
      body.destination ||
      body.dialed_number ||
      ""
    );

    const callId = String(body.call_id || body.id || body.uuid || `call_${Date.now()}`);
    const rawEvent = (body.event || body.type || body.status || "ringing").toLowerCase();

    // Normalize call status
    let status: "ringing" | "answered" | "completed" | "missed" = "ringing";
    if (rawEvent.includes("answer")) status = "answered";
    else if (rawEvent.includes("end") || rawEvent.includes("hangup") || rawEvent.includes("complete")) status = "completed";
    else if (rawEvent.includes("miss")) status = "missed";

    const duration = parseInt(body.duration || body.billsec || "0", 10);

    const normalizedFrom = normalizePhoneNumber(rawFrom);
    const digits = extractDigits(rawFrom);

    // Lookup customer in database by normalized phone or digits
    let customer: any = null;
    if (digits.length >= 7) {
      const candidates = await db.customer.findMany({
        where: {
          OR: [
            { normalizedPhones: { contains: digits } },
            { primaryPhone: { contains: digits } },
            { mobilePhone: { contains: digits } },
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
        customerId: customer ? customer.id : undefined,
      },
      create: {
        callId,
        fromNumber: rawFrom || "Unknown",
        normalizedFrom: normalizedFrom || digits || "unknown",
        toExtension: toExtension || null,
        direction: body.direction || "inbound",
        status,
        duration,
        customerId: customer ? customer.id : null,
      },
    });

    const callPayload = {
      id: callLog.id,
      callId,
      fromNumber: rawFrom || "Unknown",
      formattedFrom: formatPhoneDisplay(rawFrom || digits),
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
    if (status === "ringing") {
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
