import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getQboConnection, getQboCustomerInvoices } from "@/lib/quickbooks";

/**
 * A customer's invoices: the full history live from QuickBooks, or, when QuickBooks can't be
 * reached, the unpaid invoices cached by the last sync.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    select: {
      qboId: true,
      invoices: { orderBy: { dueDate: "desc" } },
    },
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const cached = customer.invoices.map((inv) => ({
    id: inv.id,
    qboUrl: `https://app.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(inv.qboInvoiceId.replace(/^qbo-/, ""))}`,
    docNumber: inv.docNumber,
    txnDate: inv.txnDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    balance: inv.balance,
    status: inv.status,
  }));

  if (!customer.qboId) return NextResponse.json({ invoices: [], source: "none" });

  const connection = await getQboConnection();
  if (!connection?.refreshToken) {
    return NextResponse.json({ invoices: cached, source: "cache", message: "QuickBooks isn't connected; showing unpaid invoices from the last sync." });
  }

  try {
    return NextResponse.json({ invoices: await getQboCustomerInvoices(customer.qboId), source: "quickbooks" });
  } catch (err: any) {
    console.error("[quickbooks] invoice history failed:", err?.message || err);
    return NextResponse.json({
      invoices: cached,
      source: "cache",
      message: `Couldn't reach QuickBooks (${err?.message || "error"}); showing unpaid invoices from the last sync.`,
    });
  }
}
