import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractDigits } from "@/lib/phone-utils";
import { assignCallsFromNumber, buildNormalizedPhones, linkUnmatchedCalls } from "@/lib/customers";

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

    const customer = await db.customer.create({
      data: {
        name: String(name).trim(),
        companyName: companyName || null,
        primaryPhone: primaryPhone || null,
        mobilePhone: mobilePhone || null,
        normalizedPhones: buildNormalizedPhones(primaryPhone, mobilePhone),
        email: email || null,
        billingAddress: billingAddress || null,
      },
    });

    // Created from a call ("Add Contact"): the person is saying who that caller is, so the
    // number's calls move here even if another customer shares the number
    if (body.claimCallsFrom) await assignCallsFromNumber(String(body.claimCallsFrom), customer.id);
    // Calls from any of the contact's numbers that nobody had matched yet
    await linkUnmatchedCalls();

    return NextResponse.json(customer);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
