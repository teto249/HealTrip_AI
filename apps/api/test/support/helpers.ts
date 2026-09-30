import type { FinalResponseContract } from "src/agent/contract";
import type { ChatStage } from "src/common/types";

export function finalResponse(
  proposedNextStage: ChatStage,
  message: string,
  overrides: Partial<Omit<FinalResponseContract, "proposedNextStage" | "message">> = {},
): FinalResponseContract {
  return {
    proposedNextStage,
    message,
    clarifyingQuestions: [],
    providerRefs: [],
    facilityRefs: [],
    specialtyRefs: [],
    rationaleRefs: [],
    handoffRequested: false,
    ...overrides,
  };
}
