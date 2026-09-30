import type { FinalResponseContract } from "./contract";

export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; content: string; toolCallId: string; name: string };

export interface ToolCallRequest {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface AssistantTurn {
  content: string | null;
  toolCalls: ToolCallRequest[];
}

export const CHAT_MODEL = Symbol("CHAT_MODEL");

export interface ChatModelPort {
  runTurn(input: {
    messages: ModelMessage[];
    tools: ToolDefinition[];
    forceToolName?: string;
  }): Promise<AssistantTurn>;

  finalize(input: { messages: ModelMessage[] }): Promise<FinalResponseContract>;
}
