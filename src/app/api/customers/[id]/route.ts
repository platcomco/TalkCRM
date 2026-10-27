import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchCustomerEmails } from "@/lib/gmail";
import { getRequestUser } from "@/lib/auth";
import { chatThreadUrl } from "@/lib/google-chat";
import { buildNormalizedPhones, linkUnmatchedCalls } from "@/lib/customers";

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
        chatThreads: {
          orderBy: { lastMessageAt: "desc" },
          include: {
            space: { select: { displayName: true } },
            messages: { orderBy: { createTime: "asc" }, take: 200 },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // Gmail is searched in the signed-in staff member's own mailbox. fetchCustomerEmails never
    // throws; it reports a status (ok / not_connected / expired / error) so the UI can explain
    // an empty list.
    let emails: any[] = [];
    let emailStatus: string = "ok";
    let emailMessage: string | undefined;
    if (customer.email) {
      const user = await getRequestUser(req);
      const result = await fetchCustomerEmails(customer.email, user?.email);
      emails = result.emails;
      emailStatus = result.status;
      emailMessage = result.message;
    }

    return NextResponse.json({
      ...customer,
      chatThreads: customer.chatThreads.map((t) => ({ ...t, url: chatThreadUrl(t.name) })),
      emails,
      emailStatus,
      emailMessage,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const QBO_MANAGED_ERROR =
  "This customer comes from QuickBooks. Edit it in QuickBooks; the change appears here after the next sync.";

/** Edits a contact created in TalkCRM. QuickBooks customers are read-only here (QuickBooks is the source). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.customer.findUnique({ where: { id }, select: { qboId: true } });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (existing.qboId) return NextResponse.json({ error: QBO_MANAGED_ERROR }, { status: 409 });

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Customer name is required" }, { status: 400 });

    const customer = await db.customer.update({
      where: { id },
      data: {
        name,
        companyName: body.companyName || null,
        primaryPhone: body.primaryPhone || null,
        mobilePhone: body.mobilePhone || null,
        normalizedPhones: buildNormalizedPhones(body.primaryPhone, body.mobilePhone),
        email: body.email || null,
        billingAddress: body.billingAddress || null,
      },
    });

    // A corrected phone number may now match earlier calls
    await linkUnmatchedCalls();

    return NextResponse.json(customer);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Deletes a contact created in TalkCRM (its calls stay in the call log, unlinked). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.customer.findUnique({ where: { id }, select: { qboId: true } });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (existing.qboId) return NextResponse.json({ error: QBO_MANAGED_ERROR }, { status: 409 });

    await db.customer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
