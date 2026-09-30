import type { ChatStage, ForcedToolStage } from "../common/types";

export const STAGE_TOOLS: Record<ChatStage, string[]> = {
  INTAKE: ["record_case_facts", "assess_urgency"],
  TRIAGE: ["assess_urgency", "find_emergency_facilities"],
  ROUTING: ["map_symptoms_to_specialties", "explain_pathway"],
  MATCHING: ["search_providers", "get_provider_details", "map_symptoms_to_specialties"],
  DRILLDOWN: ["get_provider_details", "search_providers", "explain_pathway"],
  EMERGENCY: ["find_emergency_facilities"],
  HANDOFF: [],
  OUT_OF_SCOPE: [],
};

export const FORCED_TOOL: Record<ForcedToolStage, string> = {
  INTAKE: "record_case_facts",
  TRIAGE: "assess_urgency",
};

export function isForcedToolStage(stage: ChatStage): stage is ForcedToolStage {
  return stage === "INTAKE" || stage === "TRIAGE";
}
