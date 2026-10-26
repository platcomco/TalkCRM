import type { Metadata } from "next";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use - TalkCRM" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use (End-User License Agreement)">
      <p>
        TalkCRM is internal software owned and operated by Platinum Communication Company (&quot;we&quot;, &quot;us&quot;).
        These terms apply to everyone who uses it.
      </p>

      <h2>Who may use TalkCRM</h2>
      <p>
        Only employees and contractors of Platinum Communication Company who have been given access, using their
        company Google Workspace account, and only for company business. TalkCRM is not offered, sold, or licensed to
        anyone else.
      </p>

      <h2>License</h2>
      <p>
        We grant authorized users a limited, non-transferable, revocable permission to use TalkCRM for their work for
        Platinum Communication Company. Access ends when a user leaves the company or access is withdrawn.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your company account secure and don&apos;t share access with others.</li>
        <li>Use customer information only to serve those customers, and follow our Privacy Policy.</li>
        <li>Don&apos;t attempt to copy data out of TalkCRM for purposes other than company business.</li>
      </ul>

      <h2>QuickBooks Online</h2>
      <p>
        An administrator connects TalkCRM to the company&apos;s own QuickBooks Online account through Intuit&apos;s
        authorization process. TalkCRM only reads information from QuickBooks and never changes it. The connection
        can be removed at any time from QuickBooks (Apps) or from TalkCRM&apos;s Settings page. Intuit is not a party to
        these terms and is not responsible for TalkCRM.
      </p>

      <h2>No warranty</h2>
      <p>
        TalkCRM is provided &quot;as is&quot; for internal use. Information it shows (such as balances) is copied from
        QuickBooks and may be out of date; QuickBooks remains the authoritative record. To the extent permitted by
        law, we are not liable for losses arising from its use.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms; the effective date above shows the latest version.</p>

      <h2>Contact</h2>
      <p>
        <a className="text-blue-600 underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>,
        Platinum Communication Company.
      </p>
    </LegalPage>
  );
}
