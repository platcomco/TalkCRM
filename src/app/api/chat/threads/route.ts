import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Threads not linked to any customer, newest first, for the "Link a thread" picker. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const threads = await db.chatThread.findMany({
    where: {
      customerId: null,
      ...(q ? { OR: [{ title: { contains: q } }, { messages: { some: { text: { contains: q } } } }] } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 25,
    select: {
      name: true,
      title: true,
      lastMessageAt: true,
      messageCount: true,
      space: { select: { displayName: true } },
    },
  });
  return NextResponse.json(threads);
}
