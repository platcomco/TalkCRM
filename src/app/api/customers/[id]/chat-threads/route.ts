import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseThreadReference } from "@/lib/google-chat";

/** Links a Chat thread (picked from the list, or pasted as a link) to this customer. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const threadName = parseThreadReference(String(body.thread || ""));
    if (!threadName) {
      return NextResponse.json(
        { error: "That doesn't look like a Google Chat thread link. In Chat, use the thread's menu → Copy link." },
        { status: 400 }
      );
    }

    const thread = await db.chatThread.findUnique({ where: { name: threadName } });
    if (!thread) {
      return NextResponse.json(
        {
          error:
            "TalkCRM hasn't synced that thread. Make sure its space is added under Settings → Google Chat, then sync and try again.",
        },
        { status: 404 }
      );
    }

    await db.chatThread.update({
      where: { name: threadName },
      data: { customerId: id, linkSource: "manual" },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Unlinks a thread. It's marked as decided so the automatic matcher won't link it back. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const threadName = req.nextUrl.searchParams.get("thread") || "";
    await db.chatThread.updateMany({
      where: { name: threadName, customerId: id },
      data: { customerId: null, linkSource: "manual" },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
