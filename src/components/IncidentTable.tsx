"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, SEVERITY_STYLE, VERIFICATION_STYLE, nf } from "./ui";

export interface IncidentTableRow {
  id: string;
  code: string;
  disasterType: string;
  state: string;
  lga: string;
  community: string | null;
  status: string;
  severity: string | null;
  verification: string;
  affected: number;
  displaced: number;
  fatalities: number;
  lastUpdated: string;
}

type SortKey = "code" | "affected" | "displaced" | "fatalities" | "lastUpdated";

export default function IncidentTable({ rows }: { rows: IncidentTableRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastUpdated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = rows;
    if (q) {
      result = rows.filter((r) =>
        [r.code, r.disasterType, r.state, r.lga, r.community ?? ""].some((f) => f.toLowerCase().includes(q))
      );
    }
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "code") cmp = a.code.localeCompare(b.code);
      else if (sortKey === "lastUpdated") cmp = new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime();
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div>
      <input
        placeholder="Search incident ID, disaster type, state, LGA, community…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-[12.5px] mb-2.5"
      />
      <div className="grid grid-cols-[110px_140px_110px_140px_70px_80px_70px_80px_90px_100px] gap-2 px-2 py-1.5 text-[10.5px] text-eoc-muted font-bold uppercase tracking-wide border-b border-eoc-border">
        <span>ID</span>
        <SortableHeader label="Disaster" active={sortKey === "code"} dir={sortDir} onClick={() => toggleSort("code")} />
        <span>State</span>
        <span>LGA / Community</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Verified</span>
        <SortableHeader label="Affected" active={sortKey === "affected"} dir={sortDir} onClick={() => toggleSort("affected")} />
        <SortableHeader label="Displaced" active={sortKey === "displaced"} dir={sortDir} onClick={() => toggleSort("displaced")} />
        <SortableHeader label="Updated" active={sortKey === "lastUpdated"} dir={sortDir} onClick={() => toggleSort("lastUpdated")} />
      </div>
      {filtered.length === 0 && <p className="text-sm text-eoc-muted py-4 text-center">No incidents match the current filters.</p>}
      {filtered.map((r) => (
        <Link
          key={r.id}
          href={`/incidents/${r.id}`}
          className="grid grid-cols-[110px_140px_110px_140px_70px_80px_70px_80px_90px_100px] gap-2 px-2 py-2 items-center text-[12px] border-b border-[#151C29] hover:bg-[#131a25]"
        >
          <span className="font-mono text-eoc-muted text-[11px]">{r.code}</span>
          <span>{r.disasterType}</span>
          <span className="text-eoc-muted">{r.state}</span>
          <span className="text-eoc-muted">{r.community ? `${r.community}, ${r.lga}` : r.lga}</span>
          <span className="text-[10.5px] text-eoc-muted">{r.status.replace("_", " ")}</span>
          <Badge className={SEVERITY_STYLE[r.severity ?? "LOW"]}>{r.severity ?? "—"}</Badge>
          <Badge className={VERIFICATION_STYLE[r.verification]}>{r.verification.slice(0, 4)}</Badge>
          <span className="tabular-nums">{nf(r.affected)}</span>
          <span className="tabular-nums">{nf(r.displaced)}</span>
          <span className="text-[10.5px] text-eoc-muted">{new Date(r.lastUpdated).toLocaleDateString("en-GB")}</span>
        </Link>
      ))}
    </div>
  );
}

function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left uppercase tracking-wide ${active ? "text-eoc-text" : "text-eoc-muted"}`}>
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}
