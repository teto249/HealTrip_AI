import { finalResponse } from "../support/helpers";
import type { TurnPlan } from "../support/stub-chat-model";

export const chestPainRadiatingFixture = {
  name: "chest_pain_radiating",
  locale: "en" as const,
  turns: [
    {
      userMessage: "I've had chest pain for about an hour, it's severe and it also hurts down my left arm.",
      plan: {
        toolCalls: [
          {
            name: "record_case_facts",
            args: {
              primarySymptom: "chest pain",
              severity: "severe",
              durationValue: 1,
              durationUnit: "hours",
              radiatesTo: ["left arm"],
              breathlessness: "none",
            },
          },
        ],
        finalResponses: [finalResponse("TRIAGE", "(should not be used — interlock should override this turn)")],
      } satisfies TurnPlan,
    },
  ],
};
