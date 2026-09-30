import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";

import { FINAL_RESPONSE_JSON_SCHEMA, FinalResponseSchema } from "../agent/contract";
import type {
  AssistantTurn,
  ChatModelPort,
  ModelMessage,
  ToolDefinition,
} from "../agent/model.port";
import type { FinalResponseContract } from "../agent/contract";

function toOpenAiMessages(messages: ModelMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "tool":
        return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      case "assistant":
        return {
          role: "assistant",
          content: m.content,
          tool_calls: m.toolCalls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.argumentsJson },
          })),
        };
    }
  });
}

function toOpenAiTools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }));
}

const MAX_OUTPUT_TOKENS = 1024;
const TEMPERATURE = 0;

@Injectable()
export class OpenAiService implements ChatModelPort {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>("OPENAI_API_KEY") ?? "";
    this.model = configService.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
    const baseURL = configService.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";

    this.enabled = apiKey.length > 0;
    this.client = new OpenAI({ apiKey: apiKey || "missing-key", baseURL });

    if (!this.enabled) {
      this.logger.warn(
        "OPENAI_API_KEY is not set — /chat will return 503 until it is configured. " +
          "The eval harness (npm test) does not need it; it stubs this service entirely.",
      );
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "The assistant is not configured — set OPENAI_API_KEY on the backend (see apps/api/.env.example).",
      );
    }
  }

  async runTurn(input: {
    messages: ModelMessage[];
    tools: ToolDefinition[];
    forceToolName?: string;
  }): Promise<AssistantTurn> {
    this.assertEnabled();

    const toolChoice: ChatCompletionToolChoiceOption | undefined = input.forceToolName
      ? { type: "function", function: { name: input.forceToolName } }
      : input.tools.length
        ? "auto"
        : undefined;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: toOpenAiMessages(input.messages),
      tools: input.tools.length ? toOpenAiTools(input.tools) : undefined,
      tool_choice: toolChoice,
    });

    const choice = completion.choices[0];
    const message = choice?.message;

    return {
      content: message?.content ?? null,
      toolCalls: (message?.tool_calls ?? [])
        .filter((tc): tc is typeof tc & { type: "function" } => tc.type === "function")
        .map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          argumentsJson: tc.function.arguments,
        })),
    };
  }

  async finalize(input: { messages: ModelMessage[] }): Promise<FinalResponseContract> {
    this.assertEnabled();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: toOpenAiMessages(input.messages),
      response_format: {
        type: "json_schema",
        json_schema: FINAL_RESPONSE_JSON_SCHEMA,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("finalize() returned non-JSON content — schema enforcement should prevent this");
    }
    return FinalResponseSchema.parse(parsed);
  }
}
