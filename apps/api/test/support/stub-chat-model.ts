import type { AssistantTurn, ChatModelPort, ModelMessage, ToolDefinition } from "src/agent/model.port";
import type { FinalResponseContract } from "src/agent/contract";

export interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TurnPlan {
  toolCalls: ScriptedToolCall[];
  finalResponses: FinalResponseContract[];
}

export class StubChatModel implements ChatModelPort {
  private plans: TurnPlan[] = [];
  private currentPlan?: TurnPlan;
  private toolIndex = 0;
  private finalizeIndex = 0;
  private callLog: Array<{ kind: "runTurn" | "finalize"; forcedTool?: string }> = [];

  loadConversation(plans: TurnPlan[]): void {
    this.plans = [...plans];
  }

  advanceToNextTurn(): void {
    this.currentPlan = this.plans.shift();
    this.toolIndex = 0;
    this.finalizeIndex = 0;
  }

  getCallLog() {
    return this.callLog;
  }

  async runTurn(input: { messages: ModelMessage[]; tools: ToolDefinition[]; forceToolName?: string }): Promise<AssistantTurn> {
    this.callLog.push({ kind: "runTurn", forcedTool: input.forceToolName });

    if (!this.currentPlan) {
      throw new Error("StubChatModel.runTurn called with no active plan — did the test call advanceToNextTurn()?");
    }

    if (this.toolIndex >= this.currentPlan.toolCalls.length) {
      return { content: "", toolCalls: [] };
    }

    const step = this.currentPlan.toolCalls[this.toolIndex]!;
    this.toolIndex++;

    if (input.forceToolName && step.name !== input.forceToolName) {
      throw new Error(
        `Fixture script mismatch: this stage forces tool_choice="${input.forceToolName}" but the script's next call is "${step.name}". The forced tool must be the first entry for a forced-tool stage's turn.`,
      );
    }

    return {
      content: null,
      toolCalls: [{ id: `stub_call_${this.toolIndex}`, name: step.name, argumentsJson: JSON.stringify(step.args) }],
    };
  }

  async finalize(_input: { messages: ModelMessage[] }): Promise<FinalResponseContract> {
    this.callLog.push({ kind: "finalize" });

    if (!this.currentPlan) {
      throw new Error("StubChatModel.finalize called with no active plan — did the test call advanceToNextTurn()?");
    }
    if (this.currentPlan.finalResponses.length === 0) {
      throw new Error("Fixture script has no finalResponses queued, but the orchestrator reached finalize() for this turn.");
    }
    const idx = Math.min(this.finalizeIndex, this.currentPlan.finalResponses.length - 1);
    this.finalizeIndex++;
    return this.currentPlan.finalResponses[idx]!;
  }
}
