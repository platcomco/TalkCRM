import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies, verifySessionToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getSessionFromCookies(req);
  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = await verifySessionToken(token);
  return NextResponse.json({ user });
}
