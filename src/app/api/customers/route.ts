import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhoneNumber, extractDigits } from "@/lib/phone-utils";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { companyName: { contains: q } },
          { email: { contains: q } },
          { primaryPhone: { contains: q } },
          { mobilePhone: { contains: q } },
          { normalizedPhones: { contains: extractDigits(q) || q } },
          { accountNumber: { contains: q } },
          { qboNotes: { contains: q } },
          { customerType: { contains: q } },
          { parentName: { contains: q } },
        ],
      }
    : {};

  // Returns every match (the directory sorts client-side by any column), with a safety cap
  const customers = await db.customer.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          calls: true,
          invoices: true,
          notes: true,
        },
      },
    },
    take: 5000,
  });

  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, companyName, primaryPhone, mobilePhone, email, billingAddress } = body;

    if (!name) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }

    const phoneDigits = [extractDigits(primaryPhone || ""), extractDigits(mobilePhone || "")].filter(Boolean);
    const normalizedList = [
      ...phoneDigits,
      ...phoneDigits.map((d) => normalizePhoneNumber(d)),
    ].join(",");

    const customer = await db.customer.create({
      data: {
        name,
        companyName: companyName || null,
        primaryPhone: primaryPhone || null,
        mobilePhone: mobilePhone || null,
        normalizedPhones: normalizedList,
        email: email || null,
        billingAddress: billingAddress || null,
      },
    });

    return NextResponse.json(customer);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
