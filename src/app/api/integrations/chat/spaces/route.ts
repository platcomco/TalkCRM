import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestUser } from "@/lib/auth";
import { listMyChatSpaces, syncAllChatSpaces } from "@/lib/google-chat";

export const dynamic = "force-dynamic";

/** The spaces TalkCRM reads, plus (when Google is connected) the spaces the signed-in person could add. */
export async function GET(req: NextRequest) {
  const selected = await db.chatSpace.findMany({
    orderBy: { displayName: "asc" },
    include: { _count: { select: { threads: true } } },
  });

  const user = await getRequestUser(req);
  let available: { name: string; displayName: string }[] = [];
  let availableError: string | null = null;
  if (user) {
    try {
      available = await listMyChatSpaces(user.email);
    } catch (err: any) {
      availableError = err.message;
    }
  }

  return NextResponse.json({ selected, available, availableError });
}

/** Adds a space; it's read with the signed-in person's Google connection (they must be a member). */
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { name, displayName } = await req.json();
    if (!/^spaces\/[A-Za-z0-9_-]+$/.test(String(name || ""))) {
      return NextResponse.json({ error: "Invalid space" }, { status: 400 });
    }

    await db.chatSpace.upsert({
      where: { name },
      update: { displayName: displayName || name, syncAsEmail: user.email.toLowerCase() },
      create: { name, displayName: displayName || name, syncAsEmail: user.email.toLowerCase() },
    });

    // First sync can take a while on a big space; run it in the background
    syncAllChatSpaces().catch((err) => console.error("[google-chat] sync after adding a space failed:", err));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Stops reading a space and drops its cached threads and messages (nothing changes in Google Chat). */
export async function DELETE(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name") || "";
    await db.chatSpace.deleteMany({ where: { name } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
