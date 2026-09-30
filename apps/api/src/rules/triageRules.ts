import type { PatientCase, UrgencyLevel } from "../common/types";

export interface TriageRule {
  id: string;
  level: UrgencyLevel;
  reason: string;
  predicate: (c: PatientCase) => boolean;
}

const LEVEL_RANK: Record<UrgencyLevel, number> = {
  NEEDS_MORE_INFO: 0,
  ROUTINE: 1,
  URGENT: 2,
  EMERGENCY: 3,
};

const RADIATION_SITES = ["jaw", "left arm", "arm", "back", "neck", "shoulder"];
const STROKE_SIGNS = [
  "face drooping",
  "facial droop",
  "slurred speech",
  "one-sided weakness",
  "one sided weakness",
  "sudden vision loss",
  "sudden confusion",
];

function mentionsAny(haystack: string | undefined, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

function anySymptomMentions(c: PatientCase, needles: string[]): boolean {
  const all = [c.primarySymptom, ...c.otherSymptoms].filter((s): s is string => Boolean(s));
  return all.some((s) => mentionsAny(s, needles));
}

export const TRIAGE_RULES: TriageRule[] = [
  {
    id: "chest_pain_radiating",
    level: "EMERGENCY",
    reason: "Chest pain radiating to the jaw, arm, back, neck or shoulder is a classic cardiac red flag.",
    predicate: (c) =>
      mentionsAny(c.primarySymptom, ["chest pain", "chest tightness", "chest pressure"]) &&
      (c.radiatesTo ?? []).some((site) => RADIATION_SITES.includes(site.toLowerCase())),
  },
  {
    id: "chest_pain_with_severe_breathlessness",
    level: "EMERGENCY",
    reason: "Chest pain together with severe breathlessness needs immediate emergency evaluation.",
    predicate: (c) =>
      mentionsAny(c.primarySymptom, ["chest pain", "chest tightness", "chest pressure"]) &&
      c.breathlessness === "severe",
  },
  {
    id: "stroke_signs",
    level: "EMERGENCY",
    reason: "Facial drooping, slurred speech, one-sided weakness or sudden vision loss are stroke warning signs.",
    predicate: (c) => anySymptomMentions(c, STROKE_SIGNS),
  },
  {
    id: "severe_bleeding_or_unconscious",
    level: "EMERGENCY",
    reason: "Severe bleeding or loss of consciousness requires emergency care, not scheduled review.",
    predicate: (c) => anySymptomMentions(c, ["unconscious", "unconsciousness", "severe bleeding", "fainted"]),
  },
  {
    id: "severe_breathing_difficulty",
    level: "EMERGENCY",
    reason: "Severe difficulty breathing on its own is an emergency regardless of the underlying cause.",
    predicate: (c) => mentionsAny(c.primarySymptom, ["breath", "breathing", "breathless"]) && c.severity === "severe",
  },
  {
    id: "chest_pain_exertional_no_radiation",
    level: "URGENT",
    reason: "Chest pain without radiation still warrants prompt cardiology review, not routine scheduling.",
    predicate: (c) =>
      mentionsAny(c.primarySymptom, ["chest pain", "chest tightness", "chest pressure"]) &&
      !(c.radiatesTo ?? []).some((site) => RADIATION_SITES.includes(site.toLowerCase())) &&
      c.breathlessness !== "severe",
  },
  {
    id: "persistent_fever",
    level: "URGENT",
    reason: "A fever lasting three or more days should be reviewed promptly rather than watched further.",
    predicate: (c) => mentionsAny(c.primarySymptom, ["fever"]) && c.durationUnit === "days" && (c.durationValue ?? 0) >= 3,
  },
  {
    id: "generic_severe_symptom",
    level: "URGENT",
    reason: "A symptom described as severe is treated as urgent by default even without a more specific match.",
    predicate: (c) => c.severity === "severe",
  },
  {
    id: "mild_or_moderate_short_course",
    level: "ROUTINE",
    reason: "A mild-to-moderate symptom with a known duration and no red flags fits routine scheduling.",
    predicate: (c) =>
      Boolean(c.primarySymptom) &&
      (c.severity === "mild" || c.severity === "moderate") &&
      c.durationValue !== undefined &&
      c.durationUnit !== undefined,
  },
];

export const REQUIRED_TRIAGE_SLOTS: Array<keyof PatientCase> = [
  "primarySymptom",
  "severity",
  "durationValue",
  "durationUnit",
];

function conditionallyRequiredSlots(c: PatientCase): Array<keyof PatientCase> {
  const extra: Array<keyof PatientCase> = [];
  if (mentionsAny(c.primarySymptom, ["chest pain", "chest tightness", "chest pressure"])) {
    if (c.radiatesTo === undefined) extra.push("radiatesTo");
    if (c.breathlessness === undefined) extra.push("breathlessness");
  }
  return extra;
}

export function missingTriageSlots(c: PatientCase): Array<keyof PatientCase> {
  const missing = REQUIRED_TRIAGE_SLOTS.filter((slot) => c[slot] === undefined);
  return [...missing, ...conditionallyRequiredSlots(c)];
}

export interface TriageResult {
  level: UrgencyLevel;
  matchedRuleIds: string[];
  reasons: string[];
  missingSlots: Array<keyof PatientCase>;
  failedTowardCare: boolean;
}

const MAX_INTAKE_ATTEMPTS_BEFORE_FAILSAFE = 3;

export function evaluate(c: PatientCase): TriageResult {
  const missingSlots = missingTriageSlots(c);

  if (missingSlots.length > 0) {
    if (c.intakeAttempts >= MAX_INTAKE_ATTEMPTS_BEFORE_FAILSAFE) {
      return {
        level: "URGENT",
        matchedRuleIds: [],
        reasons: [
          "Enough details could not be confirmed after repeated attempts, so this defaults to an urgent in-person review rather than a routine one — under-triage is the failure mode that hurts people.",
        ],
        missingSlots,
        failedTowardCare: true,
      };
    }
    return {
      level: "NEEDS_MORE_INFO",
      matchedRuleIds: [],
      reasons: [],
      missingSlots,
      failedTowardCare: false,
    };
  }

  const matched = TRIAGE_RULES.filter((rule) => rule.predicate(c));
  if (matched.length === 0) {
    return {
      level: "URGENT",
      matchedRuleIds: [],
      reasons: ["No routine pattern matched confidently, so this defaults to an urgent review rather than assuming it's nothing."],
      missingSlots: [],
      failedTowardCare: false,
    };
  }

  const level = matched.reduce<UrgencyLevel>(
    (acc, rule) => (LEVEL_RANK[rule.level] > LEVEL_RANK[acc] ? rule.level : acc),
    "ROUTINE",
  );

  return {
    level,
    matchedRuleIds: matched.map((r) => r.id),
    reasons: matched.map((r) => r.reason),
    missingSlots: [],
    failedTowardCare: false,
  };
}

export function getRuleById(id: string): TriageRule | undefined {
  return TRIAGE_RULES.find((r) => r.id === id);
}
