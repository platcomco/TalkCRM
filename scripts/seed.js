const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding TalkCRM database with sample customers and invoices...");

  // Clean existing demo data
  await prisma.note.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.invoiceCache.deleteMany();
  await prisma.customer.deleteMany();

  const customer1 = await prisma.customer.create({
    data: {
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
          {
            qboInvoiceId: "INV-0980",
            docNumber: "0980",
            totalAmount: 3200.0,
            balance: 0.0,
            dueDate: "2026-08-30",
            txnDate: "2026-08-01",
            status: "Paid",
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
      calls: {
        create: [
          {
            callId: "call_sample_1",
            fromNumber: "+15552345678",
            normalizedFrom: "+15552345678",
            toExtension: "101",
            direction: "inbound",
            status: "completed",
            duration: 184,
            timestamp: new Date(Date.now() - 3600000 * 4), // 4 hours ago
          },
        ],
      },
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      name: "Elena Rostova",
      companyName: "Summit Engineering Corp",
      primaryPhone: "(555) 789-0123",
      mobilePhone: "(555) 456-7890",
      normalizedPhones: "+15557890123,5557890123,15557890123,+15554567890,5554567890",
      email: "elena@summiteng.net",
      billingAddress: "880 Boulder Rd, Denver, CO 80202",
      qboId: "QBO-102",
      qboBalance: 0.0,
      invoices: {
        create: [
          {
            qboInvoiceId: "INV-1003",
            docNumber: "1003",
            totalAmount: 4500.0,
            balance: 0.0,
            dueDate: "2026-09-30",
            txnDate: "2026-09-01",
            status: "Paid",
          },
        ],
      },
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

  const customer3 = await prisma.customer.create({
    data: {
      name: "David Chen",
      companyName: "Pacific Design Studio",
      primaryPhone: "(555) 345-6789",
      mobilePhone: "(555) 678-9012",
      normalizedPhones: "+15553456789,5553456789,15553456789,+15556789012,5556789012",
      email: "david@pacificdesign.io",
      billingAddress: "1200 4th Ave, Seattle, WA 98101",
      qboId: "QBO-103",
      qboBalance: 875.5,
      invoices: {
        create: [
          {
            qboInvoiceId: "INV-1004",
            docNumber: "1004",
            totalAmount: 875.5,
            balance: 875.5,
            dueDate: "2026-11-01",
            txnDate: "2026-10-10",
            status: "Open",
          },
        ],
      },
    },
  });

  console.log("Seeding complete! Created 3 customers with QBO invoices, notes, and call logs.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
