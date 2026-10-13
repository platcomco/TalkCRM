import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchCustomerEmailThreads } from "@/lib/gmail";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customer = await db.customer.findUnique({
      where: { id: params.id },
      include: {
        calls: {
          orderBy: { timestamp: "desc" },
          take: 20,
        },
        invoices: {
          orderBy: { dueDate: "desc" },
          take: 20,
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Fetch emails if email exists
    let emails: any[] = [];
    if (customer.email) {
      emails = await fetchCustomerEmailThreads(customer.email);
    }

    return NextResponse.json({
      ...customer,
      emails,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const customer = await db.customer.update({
      where: { id: params.id },
      data: {
        name: body.name,
        companyName: body.companyName,
        primaryPhone: body.primaryPhone,
        mobilePhone: body.mobilePhone,
        email: body.email,
        billingAddress: body.billingAddress,
      },
    });

    return NextResponse.json(customer);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
