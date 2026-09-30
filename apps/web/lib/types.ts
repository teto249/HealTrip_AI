export type ChatStage = "INTAKE" | "TRIAGE" | "ROUTING" | "MATCHING" | "DRILLDOWN" | "EMERGENCY" | "HANDOFF" | "OUT_OF_SCOPE";

export type UrgencyLevel = "EMERGENCY" | "URGENT" | "ROUTINE" | "NEEDS_MORE_INFO";

export interface ProviderCard {
  id: string;
  name: string;
  specialty: { id: string; name: string } | string;
  facility: { id: string; name: string; city: string } | string;
  feeAmount: number;
  feeCurrency: string;
  telehealth: boolean;
  languages: string[];
  bio: string;
}

export interface FacilityCard {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string;
  hasEmergencyDepartment: boolean;
}

export interface SpecialtyCard {
  id: string;
  name: string;
  description: string;
}

export interface ToolCallLogEntry {
  name: string;
  input: unknown;
  result: unknown;
  isError: boolean;
}

export interface ChatAnswer {
  sessionId: string;
  stage: ChatStage;
  urgencyLevel?: UrgencyLevel;
  message: string;
  clarifyingQuestions: string[];
  providers: ProviderCard[];
  facilities: FacilityCard[];
  specialties: SpecialtyCard[];
  rationale: Array<{ id: string; kind: string; label: string }>;
  disclaimer: string;
  trace: {
    toolCalls: ToolCallLogEntry[];
    stageBefore: ChatStage;
    stageEffective: ChatStage;
    stageAfter: ChatStage;
    citationGuard: { ok: boolean; violations: string[]; retried: boolean };
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  answer?: ChatAnswer;
}
