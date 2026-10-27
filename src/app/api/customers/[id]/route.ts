import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchCustomerEmails } from "@/lib/gmail";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customer = await db.customer.findUnique({
      where: { id },
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

    // Fetch emails if email exists. fetchCustomerEmails never throws; it reports a status
    // (ok / not_connected / expired / error) so the UI can explain an empty list.
    let emails: any[] = [];
    let emailStatus: string = "ok";
    let emailMessage: string | undefined;
    if (customer.email) {
      const result = await fetchCustomerEmails(customer.email);
      emails = result.emails;
      emailStatus = result.status;
      emailMessage = result.message;
    }

    return NextResponse.json({
      ...customer,
      emails,
      emailStatus,
      emailMessage,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const customer = await db.customer.update({
      where: { id },
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
