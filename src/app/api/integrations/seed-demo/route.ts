import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  // Demo customers must never be mixed into a real QuickBooks-synced database
  if (process.env.ENABLE_DEMO_DATA !== "true") {
    return NextResponse.json({ error: "Demo data is disabled (set ENABLE_DEMO_DATA=true to enable)." }, { status: 403 });
  }

  try {
    // Check if customer exists
    const count = await db.customer.count();

    // Upsert demo customer 1
    await db.customer.upsert({
      where: { qboId: "QBO-101" },
      update: {},
      create: {
        name: "Marcus Vance",
        companyName: "Apex Audio Visual LLC",
        primaryPhone: "(555) 234-5678",
        mobilePhone: "(555) 901-2345",
        normalizedPhones: "+15552345678,5552345678,15552345678,+15559012345,5559012345",
        email: "marcus@apexaudiovisual.com",
        billingAddress: "420 Market St, Suite 300, San Francisco, CA 94105",
        qboId: "QBO-101",
        qboBalance: 2450.0,
        invoices: {
          create: [
            {
              qboInvoiceId: "INV-1001",
              docNumber: "1001",
              totalAmount: 1850.0,
              balance: 1850.0,
              dueDate: "2026-10-25",
              txnDate: "2026-10-01",
              status: "Open",
            },
            {
              qboInvoiceId: "INV-1002",
              docNumber: "1002",
              totalAmount: 600.0,
              balance: 600.0,
              dueDate: "2026-10-15",
              txnDate: "2026-09-15",
              status: "Overdue",
            },
          ],
        },
        notes: {
          create: [
            {
              content: "Customer called regarding expansion of conference room microphones. Very happy with previous installation.",
              author: "Sarah (Support)",
            },
          ],
        },
      },
    });

    // Upsert demo customer 2
    await db.customer.upsert({
      where: { qboId: "QBO-102" },
      update: {},
      create: {
        name: "Elena Rostova",
        companyName: "Summit Engineering Corp",
        primaryPhone: "(555) 789-0123",
        mobilePhone: "(555) 456-7890",
        normalizedPhones: "+15557890123,5557890123,15557890123,+15554567890,5554567890",
        email: "elena@summiteng.net",
        billingAddress: "880 Boulder Rd, Denver, CO 80202",
        qboId: "QBO-102",
        qboBalance: 0.0,
        notes: {
          create: [
            {
              content: "Requested quote for Q4 network hardware refresh. Account in good standing.",
              author: "Mike (Sales)",
            },
          ],
        },
      },
    });

    return NextResponse.json({ success: true, message: "Demo data loaded successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
