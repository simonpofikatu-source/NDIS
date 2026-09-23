"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideStatusRecommendation } from "./actions";

interface Recommendation {
  id: string;
  current_status: string;
  recommended_status: string;
  reason: string;
  signals: Record<string, unknown>;
  created_at: string;
}

export default function StatusRecommendationPanel({ recommendation }: { recommendation: Recommendation }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"ACCEPTED" | "REJECTED" | null>(null);

  async function decide(decision: "ACCEPTED" | "REJECTED") {
    setSubmitting(decision);
    await decideStatusRecommendation(recommendation.id, decision);
    setSubmitting(null);
    router.refresh();
  }

  return (
    <div className="bg-[#332912] border border-[#8A6A1F] rounded p-3.5">
      <div className="text-[10.5px] font-bold tracking-wide text-[#E8C67E] uppercase mb-1.5">System recommendation — human review required</div>
      <div className="text-[13px] mb-1">
        Potential status transition: <b>{recommendation.current_status.replace("_", " ")}</b> →{" "}
        <b>{recommendation.recommended_status.replace("_", " ")}</b>
      </div>
      <p className="text-[12px] text-[#E8DA9E] mb-3">{recommendation.reason}</p>
      <div className="flex gap-2">
        <button
          onClick={() => decide("ACCEPTED")}
          disabled={submitting !== null}
          className="text-[12px] font-semibold px-3 py-1.5 rounded bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] disabled:opacity-60"
        >
          {submitting === "ACCEPTED" ? "Saving…" : "Accept"}
        </button>
        <button
          onClick={() => decide("REJECTED")}
          disabled={submitting !== null}
          className="text-[12px] font-semibold px-3 py-1.5 rounded border border-[#8A6A1F] text-[#E8C67E] disabled:opacity-60"
        >
          {submitting === "REJECTED" ? "Saving…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
