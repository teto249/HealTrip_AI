import { z } from "zod";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({
  providerId: z.string().min(1),
});

type Args = z.infer<typeof ArgsSchema>;

export const getProviderDetailsTool: ToolModule<Args> = {
  name: "get_provider_details",
  description: "Returns full detail for one provider by id, including their facility.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["providerId"],
    properties: {
      providerId: { type: "string" },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const provider = ctx.data.getProviderById(args.providerId);
    if (!provider) {
      return { output: { found: false, providerId: args.providerId } };
    }

    ctx.ledger.record({ id: provider.id, kind: "provider", sourceTool: "get_provider_details", data: provider });

    return {
      output: {
        found: true,
        id: provider.id,
        name: provider.name,
        specialty: provider.specialty.name,
        facility: provider.facility.name,
        city: provider.facility.city,
        address: provider.facility.address,
        feeAmount: provider.feeAmount,
        feeCurrency: provider.feeCurrency,
        telehealth: provider.telehealth,
        languages: provider.languages,
        bio: provider.bio,
      },
      casePatch: { selectedProviderId: provider.id },
    };
  },
};
