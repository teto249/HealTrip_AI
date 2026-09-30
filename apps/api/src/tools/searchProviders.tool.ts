import { z } from "zod";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({
  specialtyId: z.string().optional(),
  city: z.string().optional(),
  telehealthOnly: z.boolean().optional(),
  maxFeeUsd: z.number().nonnegative().optional(),
  language: z.string().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

export const searchProvidersTool: ToolModule<Args> = {
  name: "search_providers",
  description:
    "Searches providers by specialty, city, telehealth availability, fee ceiling and language. Any filter you omit is backfilled from the patient's recorded preferences automatically.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      specialtyId: { type: "string" },
      city: { type: "string" },
      telehealthOnly: { type: "boolean" },
      maxFeeUsd: { type: "number" },
      language: { type: "string" },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const filters = {
      specialtyId: args.specialtyId ?? ctx.case.specialtyRefs[0],
      city: args.city ?? ctx.case.city,
      telehealthOnly: args.telehealthOnly ?? ctx.case.telehealthOk,
      maxFeeUsd: args.maxFeeUsd ?? ctx.case.budgetMaxUsd,
      language: args.language ?? ctx.case.preferredLanguage,
    };

    const results = ctx.data.searchProviders(filters);
    ctx.ledger.recordMany("provider", "search_providers", results);

    return {
      output: {
        count: results.length,
        providers: results.map((p) => ({
          id: p.id,
          name: p.name,
          specialty: p.specialty.name,
          facility: p.facility.name,
          city: p.facility.city,
          feeAmount: p.feeAmount,
          feeCurrency: p.feeCurrency,
          telehealth: p.telehealth,
          languages: p.languages,
        })),
      },
    };
  },
};
