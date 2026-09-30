import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  sessionId?: string;

  @IsIn(["en", "ar"])
  locale!: "en" | "ar";

  @IsString()
  @Length(1, 2000)
  message!: string;
}
