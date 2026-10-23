import { Hash, Network, Tag } from "lucide-react";

type CustomerTagFields = {
  customerType?: string | null;
  accountNumber?: string | null;
  parentName?: string | null;
};

/**
 * QuickBooks client type (DIRECTV vertical), DIRECTV account number and parent client,
 * shown the same way on the screen-pop, directory and customer page.
 */
export function CustomerTags({ customer, className = "" }: { customer: CustomerTagFields; className?: string }) {
  const { customerType, accountNumber, parentName } = customer;
  if (!customerType && !accountNumber && !parentName) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {customerType && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
          <Tag className="w-3 h-3" />
          {customerType}
        </span>
      )}
      {accountNumber && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full"
          title="DIRECTV account number"
        >
          <Hash className="w-3 h-3" />
          DTV {accountNumber}
        </span>
      )}
      {parentName && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
          <Network className="w-3 h-3" />
          {parentName}
        </span>
      )}
    </div>
  );
}
