import { NextResponse } from "next/server";
import { syncQboCustomers } from "@/lib/quickbooks";

export async function POST() {
  try {
    const result = await syncQboCustomers();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
