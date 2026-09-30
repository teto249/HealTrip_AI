import { Injectable, Logger } from "@nestjs/common";
import type { PatientCase, ToolCallLogEntry } from "../common/types";
import type { GroundingLedger } from "../agent/ledger";
import { DataRepository } from "../data/data.repository";
import { TOOL_REGISTRY } from "./tool-registry";

export interface DispatchResult {
  logEntry: ToolCallLogEntry;
  casePatch: Record<string, unknown>;
}

@Injectable()
export class ToolDispatcherService {
  private readonly logger = new Logger(ToolDispatcherService.name);

  constructor(private readonly data: DataRepository) {}

  async dispatch(
    name: string,
    argumentsJson: string,
    patientCase: PatientCase,
    ledger: GroundingLedger,
  ): Promise<DispatchResult> {
    const tool = TOOL_REGISTRY.get(name);
    if (!tool) {
      return {
        logEntry: { name, input: argumentsJson, result: { error: "unknown_tool" }, isError: true },
        casePatch: {},
      };
    }

    let rawArgs: unknown;
    try {
      rawArgs = argumentsJson.trim().length ? JSON.parse(argumentsJson) : {};
    } catch {
      return {
        logEntry: {
          name,
          input: argumentsJson,
          result: { error: "malformed_arguments", message: "Arguments were not valid JSON — retry this call with valid JSON." },
          isError: true,
        },
        casePatch: {},
      };
    }

    const parsed = tool.argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        logEntry: {
          name,
          input: rawArgs,
          result: { error: "invalid_arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          isError: true,
        },
        casePatch: {},
      };
    }

    try {
      const result = await tool.execute(parsed.data, { case: patientCase, ledger, data: this.data });
      return {
        logEntry: { name, input: parsed.data, result: result.output, isError: false },
        casePatch: result.casePatch ?? {},
      };
    } catch (err) {
      this.logger.error(`Tool "${name}" threw during execution`, err instanceof Error ? err.stack : String(err));
      return {
        logEntry: {
          name,
          input: parsed.data,
          result: { error: "tool_execution_failed", message: "This lookup could not be completed — try again or ask something else." },
          isError: true,
        },
        casePatch: {},
      };
    }
  }
}
