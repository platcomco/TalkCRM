import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy - TalkCRM" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        TalkCRM is an internal business tool operated by Platinum Communication Company (&quot;we&quot;, &quot;us&quot;).
        It is used only by our own employees to look up our customers&apos; accounts when they call us. It is not
        offered to the public or to other businesses. This policy explains what information TalkCRM accesses and how
        we handle it.
      </p>

      <h2>Information TalkCRM accesses</h2>
      <ul>
        <li>
          <strong>From our QuickBooks Online company (read-only):</strong> customer names, company names, phone
          numbers, email addresses, billing addresses, customer notes, client type, account balances, and details of
          unpaid invoices. TalkCRM never creates, changes, or deletes anything in QuickBooks.
        </li>
        <li>
          <strong>From our UniFi Talk phone system:</strong> call records, meaning the phone numbers involved, the
          time of each call, whether it was answered, and its duration. TalkCRM does not record or access call audio.
        </li>
        <li>
          <strong>From Google:</strong> the name and email address of the employee signing in. If an administrator
          connects a company Gmail account, TalkCRM can read email messages exchanged with a customer, only to show
          them on that customer&apos;s page.
        </li>
        <li>
          <strong>Entered by employees:</strong> notes about calls and customers.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to identify callers, show employees the caller&apos;s account and open balance, and let employees search
        and review customer accounts so we can serve our customers. We do not sell this information, share it with
        third parties, or use it for advertising.
      </p>

      <h2>Where it is stored and how it is protected</h2>
      <ul>
        <li>On a server owned and operated by Platinum Communication Company, in a local database.</li>
        <li>All access is over encrypted HTTPS connections.</li>
        <li>
          Only employees signing in with a Platinum Communication Company Google Workspace account can use TalkCRM.
        </li>
        <li>
          The QuickBooks connection uses Intuit&apos;s OAuth 2.0 authorization. Access tokens are stored only on our
          server and are never sent to web browsers.
        </li>
      </ul>

      <h2>Retention and disconnecting</h2>
      <p>
        Information is kept for as long as we use TalkCRM to serve our customers. Disconnecting TalkCRM from
        QuickBooks (in QuickBooks under Apps, or in TalkCRM&apos;s Settings) stops all further access to QuickBooks
        data. If TalkCRM is retired, its database is deleted. Customers can ask us to remove their information by
        contacting us.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a className="text-blue-600 underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        , Platinum Communication Company.
      </p>
    </LegalPage>
  );
}
