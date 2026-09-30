import type { PatientCase } from "../common/types";
import { missingTriageSlots } from "../rules/triageRules";

export function describeCase(c: PatientCase): string {
  const parts: string[] = [];
  if (c.primarySymptom) parts.push(`primary_symptom=${c.primarySymptom}`);
  if (c.otherSymptoms.length) parts.push(`other_symptoms=${c.otherSymptoms.join("; ")}`);
  if (c.durationValue !== undefined && c.durationUnit) parts.push(`duration=${c.durationValue} ${c.durationUnit}`);
  if (c.severity) parts.push(`severity=${c.severity}`);
  if (c.radiatesTo !== undefined) parts.push(`radiates_to=${c.radiatesTo.length ? c.radiatesTo.join(", ") : "none"}`);
  if (c.breathlessness) parts.push(`breathlessness=${c.breathlessness}`);
  if (c.ageBand) parts.push(`age_band=${c.ageBand}`);
  if (c.knownConditions.length) parts.push(`known_conditions=${c.knownConditions.join(", ")}`);
  if (c.wantsSecondOpinion) parts.push(`wants_second_opinion=true`);
  if (c.city) parts.push(`city=${c.city}`);
  if (c.telehealthOk !== undefined) parts.push(`telehealth_ok=${c.telehealthOk}`);
  if (c.budgetMaxUsd !== undefined) parts.push(`budget_max_usd=${c.budgetMaxUsd}`);
  if (c.preferredLanguage) parts.push(`preferred_language=${c.preferredLanguage}`);
  if (c.urgencyLevel) parts.push(`urgency_level=${c.urgencyLevel}`);
  if (c.specialtyRefs.length) parts.push(`specialty_refs=${c.specialtyRefs.join(", ")}`);
  if (c.selectedProviderId) parts.push(`selected_provider=${c.selectedProviderId}`);
  return parts.length ? parts.join(", ") : "nothing yet";
}

export function describeMissingSlots(c: PatientCase): string {
  const missing = missingTriageSlots(c);
  if (missing.length === 0) return "nothing — enough is known to assess urgency";
  const labels: Record<string, string> = {
    primarySymptom: "the main symptom",
    severity: "how severe it feels (mild, moderate, severe)",
    durationValue: "how long it's been going on",
    durationUnit: "the time unit for that duration",
    radiatesTo: "whether the pain spreads anywhere else (or confirm it doesn't)",
    breathlessness: "whether there's any shortness of breath",
  };
  return missing.map((slot) => labels[slot] ?? String(slot)).join(", ");
}

const APPEND_DEDUPE_FIELDS = new Set<keyof PatientCase>(["otherSymptoms", "knownConditions"]);

export function applyCasePatch(c: PatientCase, patch: Record<string, unknown>): PatientCase {
  const next: PatientCase = { ...c };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const field = key as keyof PatientCase;

    if (APPEND_DEDUPE_FIELDS.has(field) && Array.isArray(value)) {
      const existing = (c[field] as unknown as string[] | undefined) ?? [];
      (next as unknown as Record<string, unknown>)[field] = [...new Set([...existing, ...value])];
      continue;
    }

    (next as unknown as Record<string, unknown>)[field] = value;
  }

  return next;
}
