import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  assignCallsFromNumber,
  buildNormalizedPhones,
  customerPhones,
  parseExtraPhones,
  phoneMatchKeys,
} from "@/lib/customers";
import { addQboCustomerPhone, getQboConnection } from "@/lib/quickbooks";
import { formatPhoneDisplay } from "@/lib/phone-utils";

const QBO_FIELD_LABELS = { PrimaryPhone: "Phone", Mobile: "Mobile", AlternatePhone: "Alternate phone" };

/**
 * Adds a number (e.g. a customer calling from their cell) to an existing customer so future calls
 * from it match. With saveToQuickBooks, it also goes into the QuickBooks customer's empty Mobile or
 * Alternate phone field; otherwise (or when those are full) it is kept in TalkCRM only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const [key] = phoneMatchKeys(String(body.phone || ""));
    if (!key) return NextResponse.json({ error: "Enter a 10-digit phone number" }, { status: 400 });

    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const display = formatPhoneDisplay(key);
    const update: { mobilePhone?: string; alternatePhone?: string; extraPhones?: string } = {};
    let message: string;

    const alreadyOnCustomer = phoneMatchKeys(...customerPhones(customer)).includes(key);
    let savedInQbo = false;
    if (body.saveToQuickBooks && customer.qboId) {
      const connection = await getQboConnection();
      if (!connection?.refreshToken) {
        message = `QuickBooks isn't connected, so ${display} was saved in TalkCRM only.`;
      } else {
        try {
          const { field, alreadyThere } = await addQboCustomerPhone(customer.qboId, key);
          if (field) {
            savedInQbo = true;
            // Mirror QuickBooks now rather than waiting for the next sync
            if (field === "Mobile") update.mobilePhone = display;
            if (field === "AlternatePhone") update.alternatePhone = display;
            message = alreadyThere
              ? `${display} was already in QuickBooks (${QBO_FIELD_LABELS[field]}).`
              : `${display} was saved to QuickBooks as the ${QBO_FIELD_LABELS[field]}.`;
          } else {
            message = `This customer's Mobile and Alternate phone are already filled in QuickBooks, so ${display} was saved in TalkCRM only.`;
          }
        } catch (err: any) {
          console.error("[quickbooks] phone update failed:", err?.message || err);
          message = `Couldn't update QuickBooks (${err?.message || "error"}), so ${display} was saved in TalkCRM only.`;
        }
      }
    } else {
      message = alreadyOnCustomer ? `${display} is already on this customer.` : `${display} was added in TalkCRM.`;
    }

    const extras = parseExtraPhones(customer.extraPhones);
    if (savedInQbo) {
      update.extraPhones = extras.filter((p) => p !== key).join(",");
    } else if (!alreadyOnCustomer) {
      update.extraPhones = [...extras, key].join(",");
    }

    const updated = await db.customer.update({
      where: { id },
      data: { ...update, normalizedPhones: buildNormalizedPhones(...customerPhones({ ...customer, ...update })) },
    });

    // The person is saying who this caller is: the number's calls move here, even ones that were
    // matched to another customer sharing the number
    const linkedCalls = await assignCallsFromNumber(key, id);

    return NextResponse.json({ customer: updated, savedInQbo, linkedCalls, message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Removes a number that was added in TalkCRM (numbers from QuickBooks are changed in QuickBooks). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [key] = phoneMatchKeys(req.nextUrl.searchParams.get("phone") || "");
    if (!key) return NextResponse.json({ error: "Enter a 10-digit phone number" }, { status: 400 });

    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const extraPhones = parseExtraPhones(customer.extraPhones)
      .filter((p) => p !== key)
      .join(",");
    const updated = await db.customer.update({
      where: { id },
      data: { extraPhones, normalizedPhones: buildNormalizedPhones(...customerPhones({ ...customer, extraPhones })) },
    });
    return NextResponse.json({ customer: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
