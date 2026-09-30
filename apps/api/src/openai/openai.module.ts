import { Module } from "@nestjs/common";
import { OpenAiService } from "./openai.service";
import { CHAT_MODEL } from "../agent/model.port";

@Module({
  providers: [
    OpenAiService,
    { provide: CHAT_MODEL, useExisting: OpenAiService },
  ],
  exports: [CHAT_MODEL, OpenAiService],
})
export class OpenAiModule {}
