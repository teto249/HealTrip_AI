import { z } from "zod";
import { evaluate, getRuleById } from "../rules/triageRules";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({}).strict();
type Args = z.infer<typeof ArgsSchema>;

export const assessUrgencyTool: ToolModule<Args> = {
  name: "assess_urgency",
  description:
    "Runs the deterministic triage rules over the case recorded so far and returns an urgency level (EMERGENCY, URGENT, ROUTINE, or NEEDS_MORE_INFO) with the reasons. This is the only source of the urgency level — never state one yourself without calling this.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {},
  },
  argsSchema: ArgsSchema,
  execute: (_args, ctx) => {
    const result = evaluate(ctx.case);

    const ruleIds = [...result.matchedRuleIds];
    if (result.failedTowardCare) {
      const failsafeId = "failsafe_urgent_review";
      ctx.ledger.record({
        id: failsafeId,
        kind: "rule",
        sourceTool: "assess_urgency",
        data: { id: failsafeId, reason: result.reasons[0] },
      });
      ruleIds.push(failsafeId);
    }

    for (const id of result.matchedRuleIds) {
      const rule = getRuleById(id);
      if (rule) {
        ctx.ledger.record({
          id: rule.id,
          kind: "rule",
          sourceTool: "assess_urgency",
          data: { id: rule.id, reason: rule.reason, level: rule.level },
        });
      }
    }

    return {
      output: {
        level: result.level,
        reasons: result.reasons,
        ruleIds,
        missingSlots: result.missingSlots,
      },
      casePatch: {
        urgencyLevel: result.level,
        urgencyRuleIds: ruleIds,
      },
    };
  },
};
