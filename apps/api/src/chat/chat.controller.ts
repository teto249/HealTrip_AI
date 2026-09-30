import { Body, Controller, Post } from "@nestjs/common";
import { ChatOrchestratorService } from "./chat.service";
import { SendMessageDto } from "./dto/send-message.dto";
import type { ChatAnswer } from "../common/types";

@Controller()
export class ChatController {
  constructor(private readonly orchestrator: ChatOrchestratorService) {}

  @Post("chat")
  async sendMessage(@Body() dto: SendMessageDto): Promise<ChatAnswer> {
    return this.orchestrator.answer(dto);
  }
}
