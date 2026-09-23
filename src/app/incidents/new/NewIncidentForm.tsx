"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createIncidentReport, type NewIncidentInput, type CreateIncidentResult } from "./actions";

type DisasterType = { id: string; name: string; conditional_form_key: string | null };
type StateRow = { id: string; name: string };
type LgaRow = { id: string; name: string; state_id: string };
type ConditionalForm = {
  id: string;
  key: string;
  form_sections: { id: string; form_questions: { id: string; key: string; label: string; field_type: string; options: unknown; order_index: number }[] }[];
};

const inputCls =
  "w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-[13px] text-eoc-text outline-none";

function num(v: string) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export default function NewIncidentForm({
  disasterTypes,
  states,
  lgas,
  conditionalForms,
}: {
  disasterTypes: DisasterType[];
  states: StateRow[];
  lgas: LgaRow[];
  conditionalForms: ConditionalForm[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    disasterTypeId: "",
    stateId: "",
    lgaId: "",
    ward: "",
    community: "",
    preparedBy: "",
    phone: "",
    incidentDate: new Date().toISOString().slice(0, 10),
    latitude: "",
    longitude: "",
    maleAffected: "0",
    femaleAffected: "0",
    childrenAffected: "0",
    elderlyAffected: "0",
    maleDisplaced: "0",
    femaleDisplaced: "0",
    childrenDisplaced: "0",
    elderlyDisplaced: "0",
    livesLost: "0",
    missingPersons: "0",
    totalInjured: "0",
    housesPartial: "0",
    housesTotal: "0",
    hospitalsAffected: "0",
    schoolsAffected: "0",
    needs: "",
    challenges: "",
  });
  const [cond, setCond] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CreateIncidentResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const filteredLgas = lgas.filter((l) => l.state_id === f.stateId);
  const selectedDisasterType = disasterTypes.find((d) => d.id === f.disasterTypeId);
  const conditionalForm = conditionalForms.find((cf) => cf.key === `conditional_${selectedDisasterType?.conditional_form_key}`);
  const conditionalQuestions = conditionalForm?.form_sections.flatMap((s) => s.form_questions).sort((a, b) => a.order_index - b.order_index) ?? [];

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  const totalAffected = num(f.maleAffected) + num(f.femaleAffected) + num(f.childrenAffected) + num(f.elderlyAffected);
  const totalDisplaced = num(f.maleDisplaced) + num(f.femaleDisplaced) + num(f.childrenDisplaced) + num(f.elderlyDisplaced);

  async function submit(confirmedNoDuplicate = false) {
    setSubmitting(true);
    const input: NewIncidentInput = {
      disasterTypeId: f.disasterTypeId,
      stateId: f.stateId,
      lgaId: f.lgaId,
      ward: f.ward,
      community: f.community,
      preparedBy: f.preparedBy,
      phone: f.phone,
      incidentDate: f.incidentDate,
      latitude: f.latitude ? Number(f.latitude) : null,
      longitude: f.longitude ? Number(f.longitude) : null,
      maleAffected: num(f.maleAffected),
      femaleAffected: num(f.femaleAffected),
      childrenAffected: num(f.childrenAffected),
      elderlyAffected: num(f.elderlyAffected),
      totalAffected,
      maleDisplaced: num(f.maleDisplaced),
      femaleDisplaced: num(f.femaleDisplaced),
      childrenDisplaced: num(f.childrenDisplaced),
      elderlyDisplaced: num(f.elderlyDisplaced),
      totalDisplaced,
      livesLost: num(f.livesLost),
      missingPersons: num(f.missingPersons),
      totalInjured: num(f.totalInjured),
      housesPartial: num(f.housesPartial),
      housesTotal: num(f.housesTotal),
      hospitalsAffected: num(f.hospitalsAffected),
      schoolsAffected: num(f.schoolsAffected),
      needs: f.needs,
      challenges: f.challenges,
      extendedAnswers: cond,
      confirmedNoDuplicate,
      idempotencyKey,
    };
    const res = await createIncidentReport(input);
    setSubmitting(false);
    setResult(res);
    if (res.status === "created") {
      router.push(`/incidents/${res.incidentId}`);
    }
  }

  if (!f.disasterTypeId && disasterTypes.length === 0) {
    return (
      <div className="p-6 text-sm text-eoc-muted">
        No disaster types found. Confirm migrations 0001–0003 have been applied to your Supabase project.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-bold mb-1">New incident report</h1>
      <p className="text-xs text-eoc-muted mb-5">Form 1 — Initial Incident Report. Fields marked * are required.</p>

      {result?.status === "blocked" && (
        <div className="mb-4 bg-[#3A1414] border border-[#8C2E2E] text-[#F0A0A0] text-xs rounded p-3">
          <div className="font-semibold mb-1">Cannot submit — data quality issue</div>
          {result.flags.map((fl, i) => (
            <div key={i}>{fl.message}</div>
          ))}
        </div>
      )}

      {result?.status === "possible_duplicate" && (
        <div className="mb-4 bg-[#332912] border border-[#8A6A1F] text-[#E8C67E] text-xs rounded p-3">
          <div className="font-semibold mb-2">Possible duplicate incident(s) found</div>
          {result.candidates.map((c) => (
            <div key={c.id} className="mb-1">
              {c.incident_code} · {c.status} · {c.incident_date}
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => submit(true)}
              className="text-[11.5px] bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] rounded px-2.5 py-1.5"
            >
              This is a new, distinct incident — submit anyway
            </button>
          </div>
        </div>
      )}

      {result?.status === "error" && (
        <div className="mb-4 bg-[#3A1414] border border-[#8C2E2E] text-[#F0A0A0] text-xs rounded p-3">{result.message}</div>
      )}

      <Section title="Classification & location">
        <Grid3>
          <Field label="Disaster type *">
            <select className={inputCls} value={f.disasterTypeId} onChange={(e) => set("disasterTypeId", e.target.value)}>
              <option value="">Select…</option>
              {disasterTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="State *">
            <select className={inputCls} value={f.stateId} onChange={(e) => set("stateId", e.target.value)}>
              <option value="">Select…</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="LGA *">
            <select className={inputCls} value={f.lgaId} onChange={(e) => set("lgaId", e.target.value)} disabled={!f.stateId}>
              <option value="">Select…</option>
              {filteredLgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </Grid3>
        <Grid3>
          <Field label="Ward">
            <input className={inputCls} value={f.ward} onChange={(e) => set("ward", e.target.value)} />
          </Field>
          <Field label="Community *">
            <input className={inputCls} value={f.community} onChange={(e) => set("community", e.target.value)} />
          </Field>
          <Field label="Incident date *">
            <input type="date" className={inputCls} value={f.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} />
          </Field>
        </Grid3>
        <Grid3>
          <Field label="Prepared by *">
            <input className={inputCls} value={f.preparedBy} onChange={(e) => set("preparedBy", e.target.value)} />
          </Field>
          <Field label="Phone number">
            <input className={inputCls} value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <div />
        </Grid3>
        <Grid3>
          <Field label="Latitude">
            <input className={inputCls} value={f.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="e.g. 11.83" />
          </Field>
          <Field label="Longitude">
            <input className={inputCls} value={f.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="e.g. 13.15" />
          </Field>
        </Grid3>
      </Section>

      {conditionalQuestions.length > 0 && (
        <Section title={`${selectedDisasterType?.name}-specific questions`} accent>
          <Grid3>
            {conditionalQuestions.map((q) => (
              <Field key={q.id} label={q.label}>
                {q.field_type === "number" && (
                  <input type="number" className={inputCls} value={(cond[q.key] as string) ?? ""} onChange={(e) => setCond((p) => ({ ...p, [q.key]: e.target.value }))} />
                )}
                {q.field_type === "text" && (
                  <input className={inputCls} value={(cond[q.key] as string) ?? ""} onChange={(e) => setCond((p) => ({ ...p, [q.key]: e.target.value }))} />
                )}
                {q.field_type === "select" && (
                  <select className={inputCls} value={(cond[q.key] as string) ?? ""} onChange={(e) => setCond((p) => ({ ...p, [q.key]: e.target.value }))}>
                    <option value="">Select…</option>
                    {(q.options as string[] | null)?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {q.field_type === "yesno" && (
                  <div className="flex gap-2">
                    {["Yes", "No"].map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => setCond((p) => ({ ...p, [q.key]: v }))}
                        className={`flex-1 text-[12px] py-1.5 rounded border ${cond[q.key] === v ? "border-[#3D6FE0] bg-[#152140] text-[#9DB8F5]" : "border-[#262F3D] text-eoc-muted"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            ))}
          </Grid3>
        </Section>
      )}

      <Section title="Population affected">
        <Grid4>
          <Field label="Male (18-59)">
            <input type="number" className={inputCls} value={f.maleAffected} onChange={(e) => set("maleAffected", e.target.value)} />
          </Field>
          <Field label="Female (18-59)">
            <input type="number" className={inputCls} value={f.femaleAffected} onChange={(e) => set("femaleAffected", e.target.value)} />
          </Field>
          <Field label="Children (0-17)">
            <input type="number" className={inputCls} value={f.childrenAffected} onChange={(e) => set("childrenAffected", e.target.value)} />
          </Field>
          <Field label="Elderly (60+)">
            <input type="number" className={inputCls} value={f.elderlyAffected} onChange={(e) => set("elderlyAffected", e.target.value)} />
          </Field>
        </Grid4>
        <p className="text-xs text-eoc-muted">Total persons affected (auto-computed): <b className="text-eoc-text">{totalAffected}</b></p>
      </Section>

      <Section title="Displacement">
        <Grid4>
          <Field label="Male displaced">
            <input type="number" className={inputCls} value={f.maleDisplaced} onChange={(e) => set("maleDisplaced", e.target.value)} />
          </Field>
          <Field label="Female displaced">
            <input type="number" className={inputCls} value={f.femaleDisplaced} onChange={(e) => set("femaleDisplaced", e.target.value)} />
          </Field>
          <Field label="Children displaced">
            <input type="number" className={inputCls} value={f.childrenDisplaced} onChange={(e) => set("childrenDisplaced", e.target.value)} />
          </Field>
          <Field label="Elderly displaced">
            <input type="number" className={inputCls} value={f.elderlyDisplaced} onChange={(e) => set("elderlyDisplaced", e.target.value)} />
          </Field>
        </Grid4>
        <p className="text-xs text-eoc-muted">Total displaced (auto-computed): <b className="text-eoc-text">{totalDisplaced}</b></p>
      </Section>

      <Section title="Casualties & damage">
        <Grid4>
          <Field label="Lives lost">
            <input type="number" className={inputCls} value={f.livesLost} onChange={(e) => set("livesLost", e.target.value)} />
          </Field>
          <Field label="Missing persons">
            <input type="number" className={inputCls} value={f.missingPersons} onChange={(e) => set("missingPersons", e.target.value)} />
          </Field>
          <Field label="Total injured">
            <input type="number" className={inputCls} value={f.totalInjured} onChange={(e) => set("totalInjured", e.target.value)} />
          </Field>
          <Field label="Hospitals affected">
            <input type="number" className={inputCls} value={f.hospitalsAffected} onChange={(e) => set("hospitalsAffected", e.target.value)} />
          </Field>
        </Grid4>
        <Grid4>
          <Field label="Houses partially damaged">
            <input type="number" className={inputCls} value={f.housesPartial} onChange={(e) => set("housesPartial", e.target.value)} />
          </Field>
          <Field label="Houses totally damaged">
            <input type="number" className={inputCls} value={f.housesTotal} onChange={(e) => set("housesTotal", e.target.value)} />
          </Field>
          <Field label="Schools affected">
            <input type="number" className={inputCls} value={f.schoolsAffected} onChange={(e) => set("schoolsAffected", e.target.value)} />
          </Field>
        </Grid4>
      </Section>

      <Section title="Needs & challenges">
        <Field label="Needs">
          <textarea className={`${inputCls} min-h-[60px]`} value={f.needs} onChange={(e) => set("needs", e.target.value)} />
        </Field>
        <Field label="Challenges">
          <textarea className={`${inputCls} min-h-[60px]`} value={f.challenges} onChange={(e) => set("challenges", e.target.value)} />
        </Field>
      </Section>

      <div className="flex justify-end gap-2 mt-2">
        <button
          disabled={submitting || !f.disasterTypeId || !f.stateId || !f.lgaId || !f.community || !f.preparedBy}
          onClick={() => submit(false)}
          className="bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] text-[12.5px] font-semibold rounded px-4 py-2 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="mb-5 pb-4 border-b border-[#1A212C]">
      <div className={`text-[11px] font-bold tracking-wider uppercase mb-2.5 ${accent ? "text-[#E8C67E]" : "text-eoc-muted"}`}>{title}</div>
      {children}
    </div>
  );
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2.5 mb-2.5">{children}</div>;
}
function Grid4({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-2.5 mb-2.5">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11.5px] text-eoc-muted mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}
