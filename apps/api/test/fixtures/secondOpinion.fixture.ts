import { finalResponse } from "../support/helpers";
import type { TurnPlan } from "../support/stub-chat-model";

export const secondOpinionFixture = {
  name: "second_opinion",
  locale: "en" as const,
  turns: [
    {
      userMessage:
        "My doctor said I have mild asthma and wants to start me on medication, but I'd like a second opinion before I commit to that.",
      plan: {
        toolCalls: [
          {
            name: "record_case_facts",
            args: { primarySymptom: "asthma symptoms", severity: "mild", durationValue: 2, durationUnit: "weeks", wantsSecondOpinion: true },
          },
        ],
        finalResponses: [
          finalResponse("TRIAGE", "Wanting a second opinion before starting treatment is completely reasonable — let me first check the right urgency level."),
        ],
      } satisfies TurnPlan,
    },
  ],
};
