import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, customerId, callLogId, author } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Note content cannot be empty" }, { status: 400 });
    }

    const note = await db.note.create({
      data: {
        content: content.trim(),
        author: author || "Agent",
        customerId: customerId || null,
        callLogId: callLogId || null,
      },
    });

    return NextResponse.json(note);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
