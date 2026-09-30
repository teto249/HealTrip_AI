import { createTestApp, type TestApp } from "./support/test-app";
import { finalResponse } from "./support/helpers";
import { buildSystemPrompt } from "src/agent/prompt";
import { createPatientCase } from "src/common/types";

import { chestPainRadiatingFixture } from "./fixtures/chestPainRadiating.fixture";
import { mildAnkleSprainFixture } from "./fixtures/mildAnkleSprain.fixture";
import { secondOpinionFixture } from "./fixtures/secondOpinion.fixture";
import { vagueFatigueFixture } from "./fixtures/vagueFatigue.fixture";
import { midConversationRedFlagFixture } from "./fixtures/midConversationRedFlag.fixture";
import { directBookingRequestFixture } from "./fixtures/directBookingRequest.fixture";

interface Fixture {
  name: string;
  locale: "en" | "ar";
  turns: Array<{ userMessage: string; plan: { toolCalls: { name: string; args: Record<string, unknown> }[]; finalResponses: unknown[] } }>;
}

async function runFixture(app: TestApp, fixture: Fixture) {
  const results = [];
  let sessionId: string | undefined;
  for (const turn of fixture.turns) {
    app.stubModel.loadConversation([turn.plan as any]);
    app.stubModel.advanceToNextTurn();
    const result = await app.orchestrator.answer({ sessionId, locale: fixture.locale, message: turn.userMessage });
    sessionId = result.sessionId;
    results.push(result);
  }
  return results;
}

describe("eval harness — conversation fixtures", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("chest_pain_radiating: the post-loop safety interlock reaches EMERGENCY the moment record_case_facts completes the case", async () => {
    const results = await runFixture(app, chestPainRadiatingFixture);
    const final = results[results.length - 1]!;

    expect(final.trace.stageEffective).toBe("EMERGENCY");
    expect(final.trace.stageAfter).toBe("TRIAGE");
    expect(final.urgencyLevel).toBe("EMERGENCY");
    expect(final.providers).toHaveLength(0);
    expect(final.facilities.length).toBeGreaterThan(0);

    const toolNames = final.trace.toolCalls.map((t) => t.name);
    expect(toolNames).toContain("record_case_facts");
    expect(toolNames).toContain("find_emergency_facilities");
    expect(toolNames).not.toContain("assess_urgency");
  });

  it("mild_ankle_sprain: progresses INTAKE → TRIAGE → ROUTING → MATCHING with grounded, looked-up results", async () => {
    const results = await runFixture(app, mildAnkleSprainFixture);
    const final = results[results.length - 1]!;

    expect(final.urgencyLevel).toBe("ROUTINE");
    expect(final.stage).toBe("MATCHING");

    expect(final.specialties).toHaveLength(1);
    expect((final.specialties[0] as { id: string }).id).toBe("spec_orthopedics");
    expect(final.providers.map((p) => (p as { id: string }).id).sort()).toEqual(["doc_0602", "doc_0715"]);

    const searchCall = final.trace.toolCalls.find((t) => t.name === "search_providers");
    expect(searchCall).toBeDefined();
    expect(searchCall!.input).toEqual({});
  });

  it("second_opinion: captures wantsSecondOpinion as a structured fact and still proceeds through ordinary intake", async () => {
    const results = await runFixture(app, secondOpinionFixture);
    const final = results[results.length - 1]!;

    expect(final.stage).toBe("TRIAGE");
    const recordCall = final.trace.toolCalls.find((t) => t.name === "record_case_facts");
    expect((recordCall!.input as Record<string, unknown>).wantsSecondOpinion).toBe(true);
  });

  it("vague_fatigue: stays in INTAKE and asks a clarifying question rather than guessing urgency", async () => {
    const results = await runFixture(app, vagueFatigueFixture);
    const final = results[results.length - 1]!;

    expect(final.stage).toBe("INTAKE");
    expect(final.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(final.trace.toolCalls.map((t) => t.name)).not.toContain("assess_urgency");
  });

  it("mid_conversation_red_flag: the interrupt bus reroutes to EMERGENCY on the turn the red flag is disclosed, not the next one", async () => {
    const results = await runFixture(app, midConversationRedFlagFixture);
    const [afterTurn1, afterTurn2] = results;

    expect(afterTurn1!.trace.stageEffective).toBe("INTAKE");
    expect(afterTurn2!.trace.stageEffective).toBe("EMERGENCY");
    expect(afterTurn2!.urgencyLevel).toBe("EMERGENCY");
    expect(afterTurn2!.trace.toolCalls.map((t) => t.name)).not.toContain("assess_urgency");

    expect(app.stubModel.getCallLog()).toHaveLength(3);
  });

  it("direct_booking_request: OUT_OF_SCOPE is a deterministic override — no model call, no phone number in the reply", async () => {
    const results = await runFixture(app, directBookingRequestFixture);
    const final = results[0]!;

    expect(final.trace.stageEffective).toBe("OUT_OF_SCOPE");
    expect(app.stubModel.getCallLog()).toHaveLength(0); // the model was never called at all
    expect(final.message).not.toMatch(/\b\d[\d\s-]{7,}\d\b/); // no phone-shaped number
  });
});

describe("eval harness — citation guard", () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("rejects a response citing a provider id the ledger never returned, retries once, then falls back", async () => {
    app.stubModel.loadConversation([
      {
        toolCalls: [
          {
            name: "record_case_facts",
            args: { primarySymptom: "ankle sprain", severity: "mild", durationValue: 2, durationUnit: "days" },
          },
        ],
        finalResponses: [
          finalResponse("MATCHING", "I'd suggest Dr. Fabricated Name at a clinic we never looked up.", {
            providerRefs: ["doc_9999_does_not_exist"],
          }),
          finalResponse("MATCHING", "Still citing the same made-up provider.", { providerRefs: ["doc_9999_does_not_exist"] }),
        ],
      },
    ]);
    app.stubModel.advanceToNextTurn();

    const result = await app.orchestrator.answer({ locale: "en", message: "I need a provider recommendation." });

    expect(result.trace.citationGuard.ok).toBe(false);
    expect(result.trace.citationGuard.retried).toBe(true);
    expect(result.trace.citationGuard.violations.length).toBeGreaterThan(0);
    expect(result.providers).toHaveLength(0);
    expect(result.message).not.toMatch(/Fabricated/);
  });
});

describe("prompt content — constraints stated to the model", () => {

  it("every stage's prompt forbids naming a diagnosis or a probability", () => {
    const prompt = buildSystemPrompt("DRILLDOWN", createPatientCase("en"));
    expect(prompt).toMatch(/must not:/i);
    expect(prompt).toMatch(/name or suggest a specific medical condition/i);
    expect(prompt).toMatch(/estimate a probability/i);
  });

  it("every stage's prompt forbids stating a provider's direct contact details", () => {
    const prompt = buildSystemPrompt("MATCHING", createPatientCase("en"));
    expect(prompt).toMatch(/phone number, email, or direct booking link/i);
  });

  it("INTAKE and TRIAGE prompts state the forced tool explicitly", () => {
    const intakePrompt = buildSystemPrompt("INTAKE", createPatientCase("en"));
    expect(intakePrompt).toMatch(/only be accepted as a call to record_case_facts/i);

    const triagePrompt = buildSystemPrompt("TRIAGE", createPatientCase("en"));
    expect(triagePrompt).toMatch(/only be accepted as a call to assess_urgency/i);
  });

  it("the prompt states grounding is mandatory, not a suggestion", () => {
    const prompt = buildSystemPrompt("MATCHING", createPatientCase("en"));
    expect(prompt).toMatch(/MUST come from a tool result/i);
  });
});
