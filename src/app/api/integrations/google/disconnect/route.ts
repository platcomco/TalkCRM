import { NextRequest, NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/google";
import { getRequestUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Disconnects the signed-in staff member's own Google account. */
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const spacesUsingIt = await db.chatSpace.count({ where: { syncAsEmail: user.email.toLowerCase() } });
    await disconnectGoogle(user.email);
    return NextResponse.json({ success: true, spacesUsingIt });
  } catch (err: any) {
    console.error("[google] disconnect failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
