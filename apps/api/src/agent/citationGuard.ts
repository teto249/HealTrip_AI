import type { GroundingLedger } from "./ledger";
import type { FinalResponseContract } from "./contract";

export interface CitationGuardResult {
  ok: boolean;
  violations: string[];
}

const CURRENCY_PATTERN = /\$\s?\d+(\.\d{1,2})?|\b\d+(\.\d{1,2})?\s?(usd|dollars)\b/i;
const PHONE_PATTERN = /\b\d[\d\s-]{7,}\d\b/;
const PROPER_NOUN_PATTERN = /\b([A-Z][a-zA-Z'-]+\s){1,}[A-Z][a-zA-Z'-]+\b/;

function referencesAreGrounded(refs: string[], ledger: GroundingLedger): string[] {
  return refs.filter((id) => !ledger.has(id)).map((id) => `Referenced id "${id}" was not returned by any tool call this turn.`);
}

function phraseAppearsInLedger(phrase: string, ledger: GroundingLedger): boolean {
  const needle = phrase.toLowerCase();
  return ledger.allIds().some((id) => {
    const entry = ledger.get(id);
    const haystack = JSON.stringify(entry?.data ?? "").toLowerCase();
    return haystack.includes(needle);
  });
}

export function verifyCitations(
  final: FinalResponseContract,
  ledger: GroundingLedger,
): CitationGuardResult {
  const violations: string[] = [
    ...referencesAreGrounded(final.providerRefs, ledger),
    ...referencesAreGrounded(final.facilityRefs, ledger),
    ...referencesAreGrounded(final.specialtyRefs, ledger),
    ...referencesAreGrounded(final.rationaleRefs, ledger),
  ];

  for (const pattern of [CURRENCY_PATTERN, PHONE_PATTERN, PROPER_NOUN_PATTERN]) {
    const match = final.message.match(pattern);
    if (match && !phraseAppearsInLedger(match[0], ledger)) {
      violations.push(
        `The reply text contains "${match[0]}", which looks like a specific fact (a name, fee, or number) not traceable to anything returned by a tool this turn.`,
      );
    }
  }

  return { ok: violations.length === 0, violations };
}
