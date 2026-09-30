export type Locale = "en" | "ar";

export const STAGES = [
  "INTAKE",
  "TRIAGE",
  "ROUTING",
  "MATCHING",
  "DRILLDOWN",
  "EMERGENCY",
  "HANDOFF",
  "OUT_OF_SCOPE",
] as const;

export type ChatStage = (typeof STAGES)[number];

export type ForcedToolStage = "INTAKE" | "TRIAGE";

export type UrgencyLevel = "EMERGENCY" | "URGENT" | "ROUTINE" | "NEEDS_MORE_INFO";

export type Severity = "mild" | "moderate" | "severe";
export type DurationUnit = "hours" | "days" | "weeks" | "months";
export type Breathlessness = "none" | "mild" | "severe";

export interface PatientCase {
  locale: Locale;

  primarySymptom?: string;
  otherSymptoms: string[];
  durationValue?: number;
  durationUnit?: DurationUnit;
  severity?: Severity;
  radiatesTo?: string[];
  breathlessness?: Breathlessness;
  ageBand?: string;
  knownConditions: string[];
  wantsSecondOpinion: boolean;

  city?: string;
  telehealthOk?: boolean;
  budgetMaxUsd?: number;
  preferredLanguage?: string;

  urgencyLevel?: UrgencyLevel;
  urgencyRuleIds: string[];
  specialtyRefs: string[];
  selectedProviderId?: string;

  lastNormalStage: ChatStage;
  intakeAttempts: number;
  notes: string[];
}

export function createPatientCase(locale: Locale): PatientCase {
  return {
    locale,
    otherSymptoms: [],
    knownConditions: [],
    wantsSecondOpinion: false,
    urgencyRuleIds: [],
    specialtyRefs: [],
    lastNormalStage: "INTAKE",
    intakeAttempts: 0,
    notes: [],
  };
}

export interface ChatMessageRecord {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ToolCallLogEntry {
  name: string;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface LedgerEntry {
  id: string;
  kind: "provider" | "facility" | "specialty" | "rule" | "pathway";
  sourceTool: string;
  data: unknown;
}

export interface ChatAnswer {
  sessionId: string;
  stage: ChatStage;
  urgencyLevel?: UrgencyLevel;
  message: string;
  clarifyingQuestions: string[];
  providers: unknown[];
  facilities: unknown[];
  specialties: unknown[];
  rationale: Array<{ id: string; kind: LedgerEntry["kind"]; label: string }>;
  disclaimer: string;
  trace: {
    toolCalls: ToolCallLogEntry[];
    stageBefore: ChatStage;
    stageEffective: ChatStage;
    stageAfter: ChatStage;
    citationGuard: { ok: boolean; violations: string[]; retried: boolean };
  };
}
