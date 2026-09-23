/**
 * PROVISIONAL OPERATIONAL PRIORITY — not an approved NEMA methodology.
 * Mirrors the SQL function `calculate_provisional_priority` in
 * supabase/migrations/0005_build02_gis_and_priority.sql. Kept here so the
 * UI can show an instant preview while a form is being filled, and so the
 * scoring logic has a pure-function unit test independent of a database.
 * The database function is the source of truth for what actually gets
 * stored as `severity_suggested` — if you change the thresholds, change
 * them in both places.
 */

export type SeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PriorityRule {
  metric: string;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  weight: number;
}

export const DEFAULT_PRIORITY_RULES: PriorityRule[] = [
  { metric: "total_persons_affected", low: 50, moderate: 500, high: 5000, critical: 20000, weight: 1.0 },
  { metric: "total_displaced_persons", low: 20, moderate: 200, high: 2000, critical: 10000, weight: 1.2 },
  { metric: "lives_lost", low: 1, moderate: 3, high: 10, critical: 30, weight: 2.0 },
  { metric: "missing_persons", low: 1, moderate: 5, high: 15, critical: 40, weight: 1.5 },
  { metric: "total_persons_injured", low: 5, moderate: 25, high: 100, critical: 300, weight: 1.0 },
  { metric: "total_houses_damaged", low: 10, moderate: 100, high: 1000, critical: 5000, weight: 0.8 },
];

export interface PriorityBreakdownItem {
  metric: string;
  value: number;
  score: number;
}

export interface PriorityResult {
  score: number;
  suggestedPriority: SeverityLevel;
  breakdown: PriorityBreakdownItem[];
}

export function calculateProvisionalPriority(
  metrics: Record<string, number | undefined | null>,
  rules: PriorityRule[] = DEFAULT_PRIORITY_RULES
): PriorityResult {
  let total = 0;
  const breakdown: PriorityBreakdownItem[] = [];

  for (const rule of rules) {
    const value = metrics[rule.metric] ?? 0;
    let tier = 0;
    if (value >= rule.critical) tier = 4;
    else if (value >= rule.high) tier = 3;
    else if (value >= rule.moderate) tier = 2;
    else if (value >= rule.low) tier = 1;

    const score = tier * rule.weight;
    total += score;
    breakdown.push({ metric: rule.metric, value, score });
  }

  let suggestedPriority: SeverityLevel = "LOW";
  if (total >= 10) suggestedPriority = "CRITICAL";
  else if (total >= 6) suggestedPriority = "HIGH";
  else if (total >= 3) suggestedPriority = "MEDIUM";

  return { score: total, suggestedPriority, breakdown };
}
