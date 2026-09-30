import type { ChatStage, PatientCase } from "../common/types";

const RED_FLAG_PATTERNS: RegExp[] = [
  /radiat(e|ing|es)/i,
  /\bjaw\b/i,
  /crushing/i,
  /can'?t breathe/i,
  /cannot breathe/i,
  /severe(ly)? short(ness)? of breath/i,
  /face (is )?droop/i,
  /slurred speech/i,
  /one[- ]sided weakness/i,
  /sudden vision loss/i,
  /unconscious/i,
  /fainted/i,
  /severe bleeding/i,
  /worst headache of (my|his|her|their) life/i,
  /الأم.*(تنتشر|تمتد)/,
  /(فك|ذراع).*(ألم|وجع)/,
  /فقدان الوعي/,
  /نزيف شديد/,
  /صعوبة شديدة في التنفس/,
];

export function detectRedFlagLanguage(text: string): boolean {
  return RED_FLAG_PATTERNS.some((p) => p.test(text));
}

const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /what (disease|condition) do i have/i,
  /am i going to (die|be okay)/i,
  /diagnose me/i,
  /probability .* (cancer|disease)/i,
  /phone number/i,
  /direct(ly)? book/i,
  /\bwhatsapp\b/i,
];

export function detectOutOfScope(text: string): boolean {
  return OUT_OF_SCOPE_PATTERNS.some((p) => p.test(text));
}

const HANDOFF_CONFIRM_PATTERNS: RegExp[] = [
  /\b(confirm|proceed|book (this|that|it)|go ahead|that one)\b/i,
  /تأكيد|احجز (هذا|هذه)|نعم اكمل/,
];

export function detectHandoffConfirm(text: string): boolean {
  return HANDOFF_CONFIRM_PATTERNS.some((p) => p.test(text));
}

export function resolveEffectiveStage(
  persistedStage: ChatStage,
  patientCase: PatientCase,
  userText: string,
): ChatStage {
  if (detectRedFlagLanguage(userText) || patientCase.urgencyLevel === "EMERGENCY") {
    return "EMERGENCY";
  }

  if (detectOutOfScope(userText)) {
    return "OUT_OF_SCOPE";
  }

  if (
    detectHandoffConfirm(userText) &&
    (patientCase.selectedProviderId || persistedStage === "DRILLDOWN" || persistedStage === "MATCHING")
  ) {
    return "HANDOFF";
  }

  if (persistedStage === "EMERGENCY" || persistedStage === "OUT_OF_SCOPE" || persistedStage === "HANDOFF") {
    return patientCase.lastNormalStage;
  }

  return persistedStage;
}
