import { z } from "zod";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({
  city: z.string().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

export const findEmergencyFacilitiesTool: ToolModule<Args> = {
  name: "find_emergency_facilities",
  description: "Returns facilities with a 24/7 emergency department, nearest city first when a city is known.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      city: { type: "string" },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const city = args.city ?? ctx.case.city;
    const facilities = ctx.data.findEmergencyFacilities(city);
    ctx.ledger.recordMany("facility", "find_emergency_facilities", facilities);

    return {
      output: {
        facilities: facilities.map((f) => ({
          id: f.id,
          name: f.name,
          city: f.city,
          country: f.country,
          address: f.address,
        })),
      },
    };
  },
};
