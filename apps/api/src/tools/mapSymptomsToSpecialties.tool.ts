import { z } from "zod";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({
  symptoms: z.array(z.string()).optional(),
});

type Args = z.infer<typeof ArgsSchema>;

export const mapSymptomsToSpecialtiesTool: ToolModule<Args> = {
  name: "map_symptoms_to_specialties",
  description:
    "Ranks medical specialties against the patient's symptoms using a fixed mapping table. Omit `symptoms` to use whatever is already recorded on the case.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      symptoms: { type: "array", items: { type: "string" }, description: "Defaults to the case's recorded symptoms if omitted." },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const symptoms =
      args.symptoms && args.symptoms.length > 0
        ? args.symptoms
        : [ctx.case.primarySymptom, ...ctx.case.otherSymptoms].filter((s): s is string => Boolean(s));

    const ranked = ctx.data.mapSymptomsToSpecialties(symptoms);
    ctx.ledger.recordMany(
      "specialty",
      "map_symptoms_to_specialties",
      ranked.map((r) => r.specialty),
    );

    return {
      output: {
        ranked: ranked.map((r) => ({
          id: r.specialty.id,
          name: r.specialty.name,
          score: r.score,
          matchedKeywords: r.matchedKeywords,
        })),
      },
      casePatch: ranked.length > 0 ? { specialtyRefs: [ranked[0]!.specialty.id] } : {},
    };
  },
};
