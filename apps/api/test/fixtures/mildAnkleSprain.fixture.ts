import { finalResponse } from "../support/helpers";
import type { TurnPlan } from "../support/stub-chat-model";

export const mildAnkleSprainFixture = {
  name: "mild_ankle_sprain",
  locale: "en" as const,
  turns: [
    {
      userMessage: "I twisted my ankle two days ago. It's a mild sprain, some swelling but I can still walk on it.",
      plan: {
        toolCalls: [
          { name: "record_case_facts", args: { primarySymptom: "ankle sprain", severity: "mild", durationValue: 2, durationUnit: "days" } },
        ],
        finalResponses: [finalResponse("TRIAGE", "Got it — let me check the right next step for that.")],
      } satisfies TurnPlan,
    },
    {
      userMessage: "okay",
      plan: {
        toolCalls: [{ name: "assess_urgency", args: {} }],
        finalResponses: [
          finalResponse("ROUTING", "This looks routine — let's find the right specialist for an ankle sprain.", {
            rationaleRefs: ["mild_or_moderate_short_course"],
          }),
        ],
      } satisfies TurnPlan,
    },
    {
      userMessage: "What kind of specialist should I see, and can you show me some options?",
      plan: {
        toolCalls: [
          { name: "map_symptoms_to_specialties", args: {} },
          { name: "search_providers", args: {} },
        ],
        finalResponses: [
          finalResponse("MATCHING", "Orthopedics is the right fit for an ankle sprain — here are two options.", {
            providerRefs: ["doc_0602", "doc_0715"],
            specialtyRefs: ["spec_orthopedics"],
          }),
        ],
      } satisfies TurnPlan,
    },
  ],
};
