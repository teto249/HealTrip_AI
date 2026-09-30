import type { ChatStage, PatientCase, ToolCallLogEntry } from "../common/types";
import { missingTriageSlots } from "../rules/triageRules";

function calledTool(toolLog: ToolCallLogEntry[], name: string): boolean {
  return toolLog.some((t) => t.name === name && !t.isError);
}

export function advanceStage(
  stage: ChatStage,
  patientCase: PatientCase,
  toolLog: ToolCallLogEntry[],
): { nextStage: ChatStage; patientCase: PatientCase } {
  const next: PatientCase = { ...patientCase };

  if (stage === "EMERGENCY") {
    return { nextStage: "TRIAGE", patientCase: { ...next, lastNormalStage: "TRIAGE" } };
  }
  if (stage === "OUT_OF_SCOPE" || stage === "HANDOFF") {
    return { nextStage: next.lastNormalStage, patientCase: next };
  }

  let nextStage: ChatStage = stage;

  switch (stage) {
    case "INTAKE": {
      next.intakeAttempts += 1;
      nextStage = missingTriageSlots(next).length === 0 ? "TRIAGE" : "INTAKE";
      break;
    }
    case "TRIAGE": {
      if (next.urgencyLevel === "EMERGENCY") {
        nextStage = "EMERGENCY";
      } else if (next.urgencyLevel === "URGENT" || next.urgencyLevel === "ROUTINE") {
        nextStage = next.specialtyRefs.length > 0 ? "MATCHING" : "ROUTING";
      } else {
        nextStage = "INTAKE";
      }
      break;
    }
    case "ROUTING": {
      nextStage = next.specialtyRefs.length > 0 ? "MATCHING" : "ROUTING";
      break;
    }
    case "MATCHING": {
      nextStage = calledTool(toolLog, "search_providers") ? "DRILLDOWN" : "MATCHING";
      break;
    }
    case "DRILLDOWN": {
      nextStage = "DRILLDOWN";
      break;
    }
    default:
      nextStage = stage;
  }

  next.lastNormalStage = nextStage;
  return { nextStage, patientCase: next };
}
