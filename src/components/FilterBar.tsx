"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface FilterOptions {
  disasterGroups: { id: string; name: string }[];
  disasterTypes: { id: string; name: string; disaster_group_id: string }[];
  states: { id: string; name: string }[];
  lgas: { id: string; name: string; state_id: string }[];
}

const STATUS_OPTIONS = ["NEW", "ACTIVE", "ONGOING", "MONITORING", "ESCALATING", "STABILIZING", "STABLE", "RECOVERING", "RESPONSE_COMPLETE", "CLOSED"];
const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VERIFICATION_OPTIONS = ["UNVERIFIED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "NEEDS_CLARIFICATION"];

const selectCls = "bg-eoc-bg border border-[#262F3D] rounded px-2 py-1.5 text-[12px] text-eoc-text";

export default function FilterBar({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const stateId = params.get("state") ?? "";
  const filteredLgas = options.lgas.filter((l) => !stateId || l.state_id === stateId);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "state") next.delete("lga");
    router.push(`${pathname}?${next.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  const hasFilters = Array.from(params.keys()).some((k) => k !== "window");

  return (
    <div className="flex flex-wrap items-center gap-2 bg-eoc-panel border border-eoc-border rounded px-3 py-2.5">
      <select className={selectCls} value={params.get("group") ?? ""} onChange={(e) => setParam("group", e.target.value)}>
        <option value="">All disaster groups</option>
        {options.disasterGroups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select className={selectCls} value={params.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value)}>
        <option value="">All disaster types</option>
        {options.disasterTypes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <select className={selectCls} value={stateId} onChange={(e) => setParam("state", e.target.value)}>
        <option value="">All states</option>
        {options.states.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select className={selectCls} value={params.get("lga") ?? ""} onChange={(e) => setParam("lga", e.target.value)} disabled={!stateId}>
        <option value="">All LGAs</option>
        {filteredLgas.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <select className={selectCls} value={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s.replace("_", " ")}</option>
        ))}
      </select>
      <select className={selectCls} value={params.get("severity") ?? ""} onChange={(e) => setParam("severity", e.target.value)}>
        <option value="">All severities</option>
        {SEVERITY_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select className={selectCls} value={params.get("verification") ?? ""} onChange={(e) => setParam("verification", e.target.value)}>
        <option value="">All verification</option>
        {VERIFICATION_OPTIONS.map((v) => (
          <option key={v} value={v}>{v.replace("_", " ")}</option>
        ))}
      </select>
      <input
        type="date"
        className={selectCls}
        value={params.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value)}
        title="Incident date from"
      />
      <input
        type="date"
        className={selectCls}
        value={params.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value)}
        title="Incident date to"
      />
      {hasFilters && (
        <button onClick={clearAll} className="text-[11.5px] text-eoc-muted underline ml-1">
          Clear filters
        </button>
      )}
    </div>
  );
}
