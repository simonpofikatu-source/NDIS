"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RefreshMode = "realtime" | "5" | "15" | "30" | "60" | "manual";

/**
 * Subscribes to Postgres changes on incidents/reports/incident_updates via
 * Supabase Realtime (requires migration 0005's `alter publication
 * supabase_realtime add table ...` to have been applied — if it hasn't,
 * this subscription simply never fires, it does not error, which is why
 * the connection status below matters: it tells you whether the
 * subscription itself connected, not whether the publication is correctly
 * configured).
 */
export default function RealtimeIncidentWatcher() {
  const router = useRouter();
  const [mode, setMode] = useState<RefreshMode>("realtime");
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<Date | null>(null);

  useEffect(() => {
    if (mode !== "realtime") return;
    const supabase = createClient();
    const channel = supabase
      .channel("eoc-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => {
        setLastEvent(new Date());
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        setLastEvent(new Date());
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_updates" }, () => {
        setLastEvent(new Date());
        router.refresh();
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [mode, router]);

  useEffect(() => {
    if (mode === "realtime" || mode === "manual") return;
    const ms = Number(mode) * 60 * 1000;
    const id = setInterval(() => {
      setLastEvent(new Date());
      router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [mode, router]);

  return (
    <div className="flex items-center gap-2 text-[10.5px] text-eoc-muted">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${mode === "realtime" ? (connected ? "bg-[#1F8A5C]" : "bg-[#8A6A1F]") : "bg-[#4A5160]"}`}
      />
      <span>
        {mode === "realtime" ? (connected ? "Live" : "Connecting…") : mode === "manual" ? "Manual refresh" : `Refreshing every ${mode}m`}
      </span>
      {lastEvent && <span>· updated {lastEvent.toLocaleTimeString("en-GB")}</span>}
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as RefreshMode)}
        className="bg-transparent border border-[#262F3D] rounded px-1.5 py-0.5 text-[10.5px]"
      >
        <option value="realtime">Realtime</option>
        <option value="5">5 min</option>
        <option value="15">15 min</option>
        <option value="30">30 min</option>
        <option value="60">60 min</option>
        <option value="manual">Manual</option>
      </select>
      {mode === "manual" && (
        <button onClick={() => router.refresh()} className="underline">
          Refresh now
        </button>
      )}
    </div>
  );
}
