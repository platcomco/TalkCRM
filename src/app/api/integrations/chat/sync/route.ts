import { NextResponse } from "next/server";
import { syncAllChatSpaces } from "@/lib/google-chat";

export async function POST() {
  try {
    return NextResponse.json(await syncAllChatSpaces());
  } catch (err: any) {
    console.error("[google-chat] sync failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
