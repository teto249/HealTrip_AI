import type { ChatStage } from "../common/types";
import { STAGE_TOOLS } from "../agent/stages";
import type { ToolDefinition } from "../agent/model.port";
import type { ToolModule } from "./tool.types";

import { recordCaseFactsTool } from "./recordCaseFacts.tool";
import { assessUrgencyTool } from "./assessUrgency.tool";
import { mapSymptomsToSpecialtiesTool } from "./mapSymptomsToSpecialties.tool";
import { searchProvidersTool } from "./searchProviders.tool";
import { getProviderDetailsTool } from "./getProviderDetails.tool";
import { findEmergencyFacilitiesTool } from "./findEmergencyFacilities.tool";
import { explainPathwayTool } from "./explainPathway.tool";

const ALL_TOOLS: ToolModule<any>[] = [
  recordCaseFactsTool,
  assessUrgencyTool,
  mapSymptomsToSpecialtiesTool,
  searchProvidersTool,
  getProviderDetailsTool,
  findEmergencyFacilitiesTool,
  explainPathwayTool,
];

export const TOOL_REGISTRY = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function toolDefinitionsForStage(stage: ChatStage): ToolDefinition[] {
  const allowedNames = STAGE_TOOLS[stage];
  return allowedNames
    .map((name) => TOOL_REGISTRY.get(name))
    .filter((t): t is ToolModule => Boolean(t))
    .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
