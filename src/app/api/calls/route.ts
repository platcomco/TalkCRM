import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formatPhoneDisplay } from "@/lib/phone-utils";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  const where = status ? { status } : {};

  const calls = await db.callLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          companyName: true,
          email: true,
          qboBalance: true,
        },
      },
      notes: true,
    },
    take: 50,
  });

  const formatted = calls.map((call) => ({
    ...call,
    formattedFrom: formatPhoneDisplay(call.fromNumber),
  }));

  return NextResponse.json(formatted);
}
