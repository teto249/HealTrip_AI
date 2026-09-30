import { z } from "zod";
import { applyCasePatch, describeMissingSlots } from "../agent/caseState";
import { missingTriageSlots } from "../rules/triageRules";
import type { ToolModule } from "./tool.types";

const ArgsSchema = z.object({
  primarySymptom: z.string().min(1).optional(),
  otherSymptoms: z.array(z.string().min(1)).optional(),
  durationValue: z.number().nonnegative().optional(),
  durationUnit: z.enum(["hours", "days", "weeks", "months"]).optional(),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  radiatesTo: z.array(z.string()).optional(),
  breathlessness: z.enum(["none", "mild", "severe"]).optional(),
  ageBand: z.string().optional(),
  knownConditions: z.array(z.string()).optional(),
  wantsSecondOpinion: z.boolean().optional(),
  city: z.string().optional(),
  telehealthOk: z.boolean().optional(),
  budgetMaxUsd: z.number().nonnegative().optional(),
  preferredLanguage: z.string().optional(),
});

type Args = z.infer<typeof ArgsSchema>;

export const recordCaseFactsTool: ToolModule<Args> = {
  name: "record_case_facts",
  description:
    "Records any clinical or logistic details the patient just gave — symptom, severity, duration, radiation, breathlessness, and preferences like city, budget or telehealth. Call with whatever is new; omit fields you don't have yet.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      primarySymptom: { type: "string", description: "The main symptom in the patient's own words, e.g. 'chest pain'." },
      otherSymptoms: { type: "array", items: { type: "string" } },
      durationValue: { type: "number" },
      durationUnit: { type: "string", enum: ["hours", "days", "weeks", "months"] },
      severity: { type: "string", enum: ["mild", "moderate", "severe"] },
      radiatesTo: {
        type: "array",
        items: { type: "string" },
        description: "Body sites the pain spreads to, e.g. ['jaw','left arm']. Pass [] if asked and the answer is none.",
      },
      breathlessness: { type: "string", enum: ["none", "mild", "severe"] },
      ageBand: { type: "string" },
      knownConditions: { type: "array", items: { type: "string" } },
      wantsSecondOpinion: { type: "boolean" },
      city: { type: "string" },
      telehealthOk: { type: "boolean" },
      budgetMaxUsd: { type: "number" },
      preferredLanguage: { type: "string" },
    },
  },
  argsSchema: ArgsSchema,
  execute: (args, ctx) => {
    const patched = applyCasePatch(ctx.case, args);
    return {
      output: {
        recorded: Object.keys(args),
        missingForTriage: missingTriageSlots(patched),
        missingDescription: describeMissingSlots(patched),
      },
      casePatch: args,
    };
  },
};
