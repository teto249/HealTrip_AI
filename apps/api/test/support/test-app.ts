import "reflect-metadata"; // Nest's decorators need this polyfilled before any decorated class loads — main.ts does this for the real app, tests need their own.
import { Test } from "@nestjs/testing";
import { DataModule } from "src/data/data.module";
import { SessionModule } from "src/session/session.module";
import { ChatOrchestratorService } from "src/chat/chat.service";
import { ToolDispatcherService } from "src/tools/tool-dispatcher.service";
import { SessionService } from "src/session/session.service";
import { DataRepository } from "src/data/data.repository";
import { CHAT_MODEL } from "src/agent/model.port";
import { StubChatModel } from "./stub-chat-model";

export interface TestApp {
  orchestrator: ChatOrchestratorService;
  sessions: SessionService;
  data: DataRepository;
  stubModel: StubChatModel;
}

export async function createTestApp(): Promise<TestApp> {
  const stubModel = new StubChatModel();

  const moduleRef = await Test.createTestingModule({
    imports: [DataModule, SessionModule],
    providers: [
      ChatOrchestratorService,
      ToolDispatcherService,
      { provide: CHAT_MODEL, useValue: stubModel },
    ],
  }).compile();

  return {
    orchestrator: moduleRef.get(ChatOrchestratorService),
    sessions: moduleRef.get(SessionService),
    data: moduleRef.get(DataRepository),
    stubModel,
  };
}
