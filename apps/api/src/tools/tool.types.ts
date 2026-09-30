import type { z } from "zod";
import type { PatientCase } from "../common/types";
import type { GroundingLedger } from "../agent/ledger";
import type { DataRepository } from "../data/data.repository";
import type { ToolParameterSchema } from "../agent/model.port";

export interface ToolContext {
  case: PatientCase;
  ledger: GroundingLedger;
  data: DataRepository;
}

export interface ToolExecutionResult {
  output: unknown;
  casePatch?: Record<string, unknown>;
}

export interface ToolModule<Args = unknown> {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  argsSchema: z.ZodType<Args>;
  execute: (args: Args, ctx: ToolContext) => ToolExecutionResult | Promise<ToolExecutionResult>;
}
