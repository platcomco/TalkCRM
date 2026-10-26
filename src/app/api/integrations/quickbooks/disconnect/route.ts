import { NextResponse } from "next/server";
import { disconnectQbo } from "@/lib/quickbooks";

export async function POST() {
  try {
    const result = await disconnectQbo();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
