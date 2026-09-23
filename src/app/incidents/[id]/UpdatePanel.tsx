"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitIncidentUpdate } from "./actions";

export default function UpdatePanel({
  incidentId,
  current,
}: {
  incidentId: string;
  current: { totalAffected: number; totalDisplaced: number; livesLost: number; totalInjured: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [vals, setVals] = useState({
    totalAffected: String(current.totalAffected),
    totalDisplaced: String(current.totalDisplaced),
    livesLost: String(current.livesLost),
    totalInjured: String(current.totalInjured),
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    const res = await submitIncidentUpdate({
      incidentId,
      note,
      totalAffected: Number(vals.totalAffected),
      totalDisplaced: Number(vals.totalDisplaced),
      livesLost: Number(vals.livesLost),
      totalInjured: Number(vals.totalInjured),
    });
    setSubmitting(false);
    if (res.status === "ok") {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] text-[12.5px] font-semibold rounded px-3.5 py-2"
      >
        + Rapid update
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center p-6 z-50 overflow-y-auto">
          <div className="bg-[#0D121B] border border-eoc-border rounded w-[440px] p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-[13.5px] font-bold">Rapid incident update</div>
              <button onClick={() => setOpen(false)} className="text-eoc-muted text-lg leading-none">
                ×
              </button>
            </div>
            <label className="block mb-2.5">
              <div className="text-[11.5px] text-eoc-muted mb-1">What has changed?</div>
              <textarea
                className="w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-[13px] min-h-[60px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {(["totalAffected", "totalDisplaced", "livesLost", "totalInjured"] as const).map((k) => (
                <label key={k} className="block">
                  <div className="text-[11.5px] text-eoc-muted mb-1">{labelFor(k)}</div>
                  <input
                    type="number"
                    className="w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-[13px]"
                    value={vals[k]}
                    onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="text-[12.5px] px-3 py-1.5 rounded border border-[#262F3D]">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="text-[12.5px] font-semibold px-3 py-1.5 rounded bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function labelFor(k: string) {
  return { totalAffected: "Persons affected", totalDisplaced: "Displaced", livesLost: "Fatalities", totalInjured: "Injured" }[k] ?? k;
}
