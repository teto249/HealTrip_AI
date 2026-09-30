import { finalResponse } from "../support/helpers";
import type { TurnPlan } from "../support/stub-chat-model";

export const midConversationRedFlagFixture = {
  name: "mid_conversation_red_flag",
  locale: "en" as const,
  turns: [
    {
      userMessage: "I've had a mild headache for two days.",
      plan: {
        toolCalls: [{ name: "record_case_facts", args: { primarySymptom: "headache", severity: "mild", durationValue: 2, durationUnit: "days" } }],
        finalResponses: [finalResponse("TRIAGE", "Thanks — let me check how urgent this is.")],
      } satisfies TurnPlan,
    },
    {
      userMessage: "Actually, now I'm also getting chest pain and it's spreading to my jaw.",
      plan: {
        toolCalls: [],
        finalResponses: [finalResponse("TRIAGE", "(should not be used — interrupt bus should override this turn)")],
      } satisfies TurnPlan,
    },
  ],
};
