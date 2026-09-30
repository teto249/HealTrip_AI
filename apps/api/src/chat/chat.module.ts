import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatOrchestratorService } from "./chat.service";
import { ToolDispatcherService } from "../tools/tool-dispatcher.service";
import { DataModule } from "../data/data.module";
import { OpenAiModule } from "../openai/openai.module";
import { SessionModule } from "../session/session.module";

@Module({
  imports: [DataModule, OpenAiModule, SessionModule],
  controllers: [ChatController],
  providers: [ChatOrchestratorService, ToolDispatcherService],
})
export class ChatModule {}
