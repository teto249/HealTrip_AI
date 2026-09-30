import { z } from "zod";
import type { ToolModule } from "./tool.types";

const PATHWAY_KEYS = ["referral", "second_opinion", "pre_visit_prep", "telehealth_vs_in_person"] as const;

const ArgsSchema = z.object({
  key: z.enum(PATHWAY_KEYS),
});

type Args = z.infer<typeof ArgsSchema>;

export const explainPathwayTool: ToolModule<Args> = {
  name: "explain_pathway",
  description: "Returns vetted explanatory copy for one of: referral, second_opinion, pre_visit_prep, telehealth_vs_in_person.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["key"],
    properties: {
      key: { type: "string", enum: [...PATHWAY_KEYS] },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const content = ctx.data.getPathwayContent(args.key);
    if (!content) {
      return { output: { found: false, key: args.key } };
    }

    const body = ctx.case.locale === "ar" ? content.bodyAr : content.bodyEn;
    ctx.ledger.record({ id: content.key, kind: "pathway", sourceTool: "explain_pathway", data: { key: content.key, body } });

    return { output: { key: content.key, body } };
  },
};
