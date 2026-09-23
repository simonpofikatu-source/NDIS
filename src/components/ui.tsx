import { clsx } from "clsx";

export const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-[#3A1414] border-[#8C2E2E] text-[#F0A0A0]",
  HIGH: "bg-[#3A2712] border-[#8C5A1F] text-[#F0BE7E]",
  MEDIUM: "bg-[#37340F] border-[#8A7E1E] text-[#E8DA7E]",
  LOW: "bg-[#123A28] border-[#1F8A5C] text-[#7EF0C0]",
};

export const VERIFICATION_STYLE: Record<string, string> = {
  VERIFIED: "bg-[#0F3230] border-[#1F8A80] text-[#7EE8DF]",
  UNDER_REVIEW: "bg-[#332912] border-[#8A6A1F] text-[#E8C67E]",
  UNVERIFIED: "bg-[#25282F] border-[#4A5160] text-[#9AA4B5]",
  REJECTED: "bg-[#3A1414] border-[#8C2E2E] text-[#F0A0A0]",
  NEEDS_CLARIFICATION: "bg-[#332912] border-[#8A6A1F] text-[#E8C67E]",
};

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded border whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-eoc-panel border border-eoc-border rounded">
      {title && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-eoc-border">
          <span className="text-[11px] font-bold tracking-wider text-eoc-muted uppercase">{title}</span>
          {right}
        </div>
      )}
      <div className="p-3.5">{children}</div>
    </div>
  );
}

export function KPI({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-eoc-panel border border-eoc-border rounded px-3.5 py-3">
      <div className="text-[11px] text-eoc-muted font-semibold tracking-wide uppercase">{label}</div>
      <div className={clsx("text-2xl font-bold mt-1 tabular-nums", accent)}>{value}</div>
    </div>
  );
}

export function nf(n: number) {
  return new Intl.NumberFormat("en-NG").format(Math.round(n || 0));
}
