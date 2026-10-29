import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getQboConnection, getQboCustomerEstimates, qboEstimateUrl } from "@/lib/quickbooks";

/**
 * A customer's estimates: every status live from QuickBooks, or, when QuickBooks can't be
 * reached, the Pending and Accepted estimates cached by the last sync.
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
      estimates: { orderBy: { txnDate: "desc" } },
    },
  });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const cached = customer.estimates.map((est) => ({
    id: est.qboEstimateId,
    qboUrl: qboEstimateUrl(est.qboEstimateId),
    docNumber: est.docNumber,
    txnDate: est.txnDate,
    expirationDate: est.expirationDate,
    acceptedDate: est.acceptedDate,
    totalAmount: est.totalAmount,
    status: est.status,
    summary: est.summary,
  }));

  if (!customer.qboId) return NextResponse.json({ estimates: [], source: "none" });

  const connection = await getQboConnection();
  if (!connection?.refreshToken) {
    return NextResponse.json({ estimates: cached, source: "cache", message: "QuickBooks isn't connected; showing open estimates from the last sync." });
  }

  try {
    return NextResponse.json({ estimates: await getQboCustomerEstimates(customer.qboId), source: "quickbooks" });
  } catch (err: any) {
    console.error("[quickbooks] estimate history failed:", err?.message || err);
    return NextResponse.json({
      estimates: cached,
      source: "cache",
      message: `Couldn't reach QuickBooks (${err?.message || "error"}); showing open estimates from the last sync.`,
    });
  }
}
