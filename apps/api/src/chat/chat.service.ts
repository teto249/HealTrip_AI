import { Inject, Injectable, HttpException, HttpStatus, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { ChatAnswer, ChatStage, PatientCase, ToolCallLogEntry } from "../common/types";
import { SessionService, type SessionRecord } from "../session/session.service";
import { ToolDispatcherService } from "../tools/tool-dispatcher.service";
import { toolDefinitionsForStage } from "../tools/tool-registry";
import { DataRepository } from "../data/data.repository";
import { CHAT_MODEL, type ChatModelPort, type ModelMessage } from "../agent/model.port";
import { GroundingLedger } from "../agent/ledger";
import { buildSystemPrompt } from "../agent/prompt";
import { resolveEffectiveStage, detectRedFlagLanguage } from "../agent/stageResolver";
import { FORCED_TOOL, isForcedToolStage } from "../agent/stages";
import { applyCasePatch } from "../agent/caseState";
import { advanceStage } from "../agent/advanceStage";
import { verifyCitations } from "../agent/citationGuard";
import { evaluate, getRuleById } from "../rules/triageRules";
import { detectSuspiciousPatterns, wrapAsPatientData } from "../security/injection-guard";
import type { FinalResponseContract } from "../agent/contract";
import type { SendMessageDto } from "./dto/send-message.dto";

const MAX_TOOL_ITERATIONS = 6;
const MODEL_RETRY_DELAY_MS = 500;

const FINALIZE_NUDGE =
  "Now produce your final structured response for this turn. Only reference ids in providerRefs, " +
  "facilityRefs, specialtyRefs and rationaleRefs that appeared in a tool result above — never invent " +
  "one. If you don't have enough grounded information for something, leave that ref list empty and " +
  "say so in the message instead of guessing.";

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly toolDispatcher: ToolDispatcherService,
    private readonly data: DataRepository,
    @Inject(CHAT_MODEL) private readonly chatModel: ChatModelPort,
  ) {}

  async answer(dto: SendMessageDto): Promise<ChatAnswer> {
    const record = this.sessions.getOrCreate(dto.sessionId, dto.locale);

    if (!this.sessions.checkAndRecordRate(record)) {
      throw new HttpException(
        { message: "Too many messages — please wait a moment and try again.", retryAfterSeconds: 60 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const suspicious = detectSuspiciousPatterns(dto.message);

    const stageBefore = record.stage;
    const priorMessages = this.sessions.recentMessages(record);

    const effectiveStage = resolveEffectiveStage(record.stage, record.case, dto.message);
    const forcedEmergencyByKeywords = effectiveStage === "EMERGENCY" && detectRedFlagLanguage(dto.message);

    this.sessions.appendMessage(record, { role: "user", content: dto.message, createdAt: new Date().toISOString() });

    let workingCase = record.case;
    const ledger = new GroundingLedger();
    const toolLog: ToolCallLogEntry[] = [];

    this.seedLedgerWithCaseContinuity(workingCase, ledger);

    if (suspicious) {
      toolLog.push({ name: "_injection_screen", input: { flagged: true }, result: { note: "suspicious pattern detected, turn proceeded" }, isError: false });
    }

    const preLoopRuleCheck = evaluate(workingCase);
    if (preLoopRuleCheck.level === "EMERGENCY" || forcedEmergencyByKeywords) {
      return this.finishAsEmergency({ record, stageBefore, workingCase, ledger, toolLog, forcedByKeywords: forcedEmergencyByKeywords });
    }

    const systemPrompt = buildSystemPrompt(effectiveStage, workingCase);
    const runningHistory: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...priorMessages.map((m): ModelMessage => (m.role === "user" ? { role: "user", content: m.content } : { role: "assistant", content: m.content })),
      { role: "user", content: wrapAsPatientData(dto.message) },
    ];

    const tools = toolDefinitionsForStage(effectiveStage);
    const forcedTool = isForcedToolStage(effectiveStage) ? FORCED_TOOL[effectiveStage] : undefined;

    let iterations = 0;
    while (tools.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      const turn = await this.callModelWithRetry(() =>
        this.chatModel.runTurn({
          messages: runningHistory,
          tools,
          forceToolName: iterations === 0 ? forcedTool : undefined,
        }),
      );

      if (turn.toolCalls.length === 0) break;

      runningHistory.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });

      for (const call of turn.toolCalls) {
        const dispatch = await this.toolDispatcher.dispatch(call.name, call.argumentsJson, workingCase, ledger);
        toolLog.push(dispatch.logEntry);
        workingCase = applyCasePatch(workingCase, dispatch.casePatch);
        runningHistory.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(dispatch.logEntry.result),
        });
      }

      iterations++;
    }

    const postLoopRuleCheck = evaluate(workingCase);
    if (postLoopRuleCheck.level === "EMERGENCY") {
      return this.finishAsEmergency({ record, stageBefore, workingCase, ledger, toolLog });
    }

    let final: FinalResponseContract;
    let citation: { ok: boolean; violations: string[] };
    let retried = false;

    if (effectiveStage === "OUT_OF_SCOPE") {
      final = this.buildOutOfScopeOverride(workingCase, ledger);
      citation = { ok: true, violations: [] };
    } else {
      final = await this.callModelWithRetry(() =>
        this.chatModel.finalize({ messages: [...runningHistory, { role: "system", content: FINALIZE_NUDGE }] }),
      );
      citation = verifyCitations(final, ledger);

      if (!citation.ok) {
        retried = true;
        const correction: ModelMessage = {
          role: "system",
          content: `Your previous response was rejected: ${citation.violations.join(" ")} Rewrite it: only reference ids that came from a tool result above, and remove any specific fact not backed by one.`,
        };
        final = await this.callModelWithRetry(() => this.chatModel.finalize({ messages: [...runningHistory, correction] }));
        citation = verifyCitations(final, ledger);
      }

      if (!citation.ok) {
        final = this.buildDeterministicFallback(effectiveStage, workingCase);
      }
    }

    return this.finalizeTurn({
      record,
      stageBefore,
      governingStage: effectiveStage,
      workingCase,
      ledger,
      toolLog,
      final,
      citation,
      retried,
    });
  }

  private async callModelWithRetry<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      this.logger.warn(`Model call failed, retrying once: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((resolve) => setTimeout(resolve, MODEL_RETRY_DELAY_MS));
      try {
        return await call();
      } catch (retryErr) {
        this.logger.error(
          `Model call failed again after one retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        );
        throw new ServiceUnavailableException(
          "The assistant is temporarily unavailable — please try again in a moment.",
        );
      }
    }
  }

  private finalizeTurn(input: {
    record: SessionRecord;
    stageBefore: ChatStage;
    governingStage: ChatStage;
    workingCase: PatientCase;
    ledger: GroundingLedger;
    toolLog: ToolCallLogEntry[];
    final: FinalResponseContract;
    citation: { ok: boolean; violations: string[] };
    retried: boolean;
  }): ChatAnswer {
    const { record, stageBefore, governingStage, workingCase, ledger, toolLog, final, citation, retried } = input;

    const providers = this.hydrateRefs(final.providerRefs, ledger);
    const facilities = this.hydrateRefs(final.facilityRefs, ledger);
    const specialties = this.hydrateRefs(final.specialtyRefs, ledger);
    const rationale = final.rationaleRefs
      .map((id) => ledger.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => ({ id: e.id, kind: e.kind, label: this.rationaleLabel(e.data) }));

    const { nextStage, patientCase: updatedCase } = advanceStage(governingStage, workingCase, toolLog);

    record.stage = nextStage;
    record.case = updatedCase;
    this.sessions.appendMessage(record, { role: "assistant", content: final.message, createdAt: new Date().toISOString() });
    this.sessions.save(record);

    return {
      sessionId: record.id,
      stage: nextStage,
      urgencyLevel: updatedCase.urgencyLevel,
      message: final.message,
      clarifyingQuestions: final.clarifyingQuestions,
      providers,
      facilities,
      specialties,
      rationale,
      disclaimer: this.disclaimer(updatedCase.locale),
      trace: {
        toolCalls: toolLog,
        stageBefore,
        stageEffective: governingStage,
        stageAfter: nextStage,
        citationGuard: { ok: citation.ok, violations: citation.violations, retried },
      },
    };
  }

  private async finishAsEmergency(input: {
    record: SessionRecord;
    stageBefore: ChatStage;
    workingCase: PatientCase;
    ledger: GroundingLedger;
    toolLog: ToolCallLogEntry[];
    forcedByKeywords?: boolean;
  }): Promise<ChatAnswer> {
    let { workingCase } = input;
    const { ledger, toolLog, forcedByKeywords = false } = input;

    const ruleCheck = evaluate(workingCase);
    const ruleIds = ruleCheck.level === "EMERGENCY" ? [...ruleCheck.matchedRuleIds] : [];

    if (forcedByKeywords && !ruleIds.includes("keyword_red_flag_language")) {
      ruleIds.push("keyword_red_flag_language");
      ledger.record({
        id: "keyword_red_flag_language",
        kind: "rule",
        sourceTool: "stage_resolver",
        data: { id: "keyword_red_flag_language", reason: "The patient's own wording matched an emergency red-flag pattern." },
      });
    }

    for (const id of ruleIds) {
      const rule = getRuleById(id);
      if (rule) ledger.record({ id: rule.id, kind: "rule", sourceTool: "safety_interlock", data: { id: rule.id, reason: rule.reason, level: rule.level } });
    }

    if (workingCase.urgencyLevel !== "EMERGENCY" || ruleIds.length > 0) {
      workingCase = applyCasePatch(workingCase, {
        urgencyLevel: "EMERGENCY",
        urgencyRuleIds: [...new Set([...workingCase.urgencyRuleIds, ...ruleIds])],
      });
    }

    if (ledger.entriesOfKind("facility").length === 0) {
      const dispatch = await this.toolDispatcher.dispatch(
        "find_emergency_facilities",
        JSON.stringify({ city: workingCase.city }),
        workingCase,
        ledger,
      );
      toolLog.push(dispatch.logEntry);
      workingCase = applyCasePatch(workingCase, dispatch.casePatch);
    }

    const final = this.buildEmergencyOverride(workingCase, ledger);

    return this.finalizeTurn({
      record: input.record,
      stageBefore: input.stageBefore,
      governingStage: "EMERGENCY",
      workingCase,
      ledger,
      toolLog,
      final,
      citation: { ok: true, violations: [] },
      retried: false,
    });
  }

  private seedLedgerWithCaseContinuity(patientCase: PatientCase, ledger: GroundingLedger): void {
    if (patientCase.selectedProviderId) {
      const provider = this.data.getProviderById(patientCase.selectedProviderId);
      if (provider) ledger.record({ id: provider.id, kind: "provider", sourceTool: "case_continuity", data: provider });
    }
    for (const specialtyId of patientCase.specialtyRefs) {
      const specialty = this.data.getSpecialtyById(specialtyId);
      if (specialty) ledger.record({ id: specialty.id, kind: "specialty", sourceTool: "case_continuity", data: specialty });
    }
    for (const ruleId of patientCase.urgencyRuleIds) {
      const rule = getRuleById(ruleId);
      if (rule) {
        ledger.record({ id: rule.id, kind: "rule", sourceTool: "case_continuity", data: { id: rule.id, reason: rule.reason, level: rule.level } });
      } else if (ruleId === "failsafe_urgent_review") {
        ledger.record({
          id: ruleId,
          kind: "rule",
          sourceTool: "case_continuity",
          data: { id: ruleId, reason: "Fails toward care after repeated incomplete intake." },
        });
      }
    }
  }

  private buildEmergencyOverride(patientCase: PatientCase, ledger: GroundingLedger): FinalResponseContract {
    const content = this.data.getPathwayContent("emergency_redirect");
    const fallbackEn = "Based on what you've described, this needs immediate in-person emergency care — please go to the nearest emergency department now.";
    const fallbackAr = "بناءً على ما وصفته، تحتاج هذه الحالة إلى رعاية طارئة فورية — يرجى التوجه إلى أقرب قسم طوارئ الآن.";
    const body = content ? (patientCase.locale === "ar" ? content.bodyAr : content.bodyEn) : patientCase.locale === "ar" ? fallbackAr : fallbackEn;

    if (content) {
      ledger.record({ id: "emergency_redirect", kind: "pathway", sourceTool: "orchestrator", data: { key: "emergency_redirect", body } });
    }

    return {
      proposedNextStage: "EMERGENCY",
      message: body,
      clarifyingQuestions: [],
      providerRefs: [],
      facilityRefs: ledger.entriesOfKind("facility").map((e) => e.id),
      specialtyRefs: [],
      rationaleRefs: [...new Set(patientCase.urgencyRuleIds)],
      handoffRequested: false,
    };
  }

  private buildOutOfScopeOverride(patientCase: PatientCase, ledger: GroundingLedger): FinalResponseContract {
    const content = this.data.getPathwayContent("out_of_scope_redirect");
    const fallbackEn = "That's outside what I can help with directly — a member of our care team will follow up with you.";
    const fallbackAr = "هذا خارج ما يمكنني المساعدة فيه مباشرة — سيتواصل معك أحد أعضاء فريق الرعاية.";
    const body = content ? (patientCase.locale === "ar" ? content.bodyAr : content.bodyEn) : patientCase.locale === "ar" ? fallbackAr : fallbackEn;

    if (content) {
      ledger.record({ id: "out_of_scope_redirect", kind: "pathway", sourceTool: "orchestrator", data: { key: "out_of_scope_redirect", body } });
    }

    return {
      proposedNextStage: "OUT_OF_SCOPE",
      message: body,
      clarifyingQuestions: [],
      providerRefs: [],
      facilityRefs: [],
      specialtyRefs: [],
      rationaleRefs: content ? ["out_of_scope_redirect"] : [],
      handoffRequested: false,
    };
  }

  private buildDeterministicFallback(stage: ChatStage, patientCase: PatientCase): FinalResponseContract {
    const en = "I wasn't able to confirm enough to answer that reliably. Let me connect you with a member of our care team instead.";
    const ar = "لم أتمكن من التأكد بما يكفي للإجابة على ذلك بثقة. دعني أوصلك بأحد أعضاء فريق الرعاية بدلاً من ذلك.";
    return {
      proposedNextStage: stage,
      message: patientCase.locale === "ar" ? ar : en,
      clarifyingQuestions: [],
      providerRefs: [],
      facilityRefs: [],
      specialtyRefs: [],
      rationaleRefs: [],
      handoffRequested: false,
    };
  }

  private hydrateRefs(refs: string[], ledger: GroundingLedger): unknown[] {
    return refs
      .map((id) => ledger.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => e.data);
  }

  private rationaleLabel(data: unknown): string {
    if (data && typeof data === "object" && "reason" in data && typeof (data as { reason?: unknown }).reason === "string") {
      return (data as { reason: string }).reason;
    }
    if (data && typeof data === "object" && "body" in data && typeof (data as { body?: unknown }).body === "string") {
      return (data as { body: string }).body;
    }
    return JSON.stringify(data);
  }

  private disclaimer(locale: "en" | "ar"): string {
    return locale === "ar"
      ? "هذا المساعد يقدم توجيهًا وليس تشخيصًا طبيًا. في حالات الطوارئ، توجّه دائمًا إلى أقرب قسم طوارئ."
      : "This assistant provides navigation, not a medical diagnosis. In an emergency, always go to the nearest emergency department.";
  }
}
