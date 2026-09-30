import { finalResponse } from "../support/helpers";
import type { TurnPlan } from "../support/stub-chat-model";

export const vagueFatigueFixture = {
  name: "vague_fatigue",
  locale: "en" as const,
  turns: [
    {
      userMessage: "I've just been feeling really tired for a while now.",
      plan: {
        toolCalls: [{ name: "record_case_facts", args: { primarySymptom: "fatigue" } }],
        finalResponses: [
          finalResponse("INTAKE", "Got it — how severe would you say it is, and how long has this been going on?", {
            clarifyingQuestions: ["How severe is it — mild, moderate, or severe?", "How long has this been going on?"],
          }),
        ],
      } satisfies TurnPlan,
    },
  ],
};
