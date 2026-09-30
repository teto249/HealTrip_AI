import { z } from "zod";
import { STAGES } from "../common/types";

export const FinalResponseSchema = z.object({
  proposedNextStage: z.enum(STAGES),
  message: z.string().min(1),
  clarifyingQuestions: z.array(z.string()).max(2),
  providerRefs: z.array(z.string()),
  facilityRefs: z.array(z.string()),
  specialtyRefs: z.array(z.string()),
  rationaleRefs: z.array(z.string()),
  handoffRequested: z.boolean(),
});

export type FinalResponseContract = z.infer<typeof FinalResponseSchema>;

export const FINAL_RESPONSE_JSON_SCHEMA = {
  name: "final_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      proposedNextStage: { type: "string", enum: [...STAGES] },
      message: { type: "string" },
      clarifyingQuestions: {
        type: "array",
        items: { type: "string" },
        maxItems: 2,
      },
      providerRefs: { type: "array", items: { type: "string" } },
      facilityRefs: { type: "array", items: { type: "string" } },
      specialtyRefs: { type: "array", items: { type: "string" } },
      rationaleRefs: { type: "array", items: { type: "string" } },
      handoffRequested: { type: "boolean" },
    },
    required: [
      "proposedNextStage",
      "message",
      "clarifyingQuestions",
      "providerRefs",
      "facilityRefs",
      "specialtyRefs",
      "rationaleRefs",
      "handoffRequested",
    ],
  },
} as const;
