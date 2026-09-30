import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createPatientCase, type ChatMessageRecord, type ChatStage, type Locale, type PatientCase } from "../common/types";

export interface SessionRecord {
  id: string;
  locale: Locale;
  stage: ChatStage;
  case: PatientCase;
  messages: ChatMessageRecord[];
  requestTimestamps: number[];
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_HISTORY_MESSAGES = 24;

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  getOrCreate(sessionId: string | undefined, locale: Locale): SessionRecord {
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) return existing;
    }

    const id = sessionId ?? randomUUID();
    const record: SessionRecord = {
      id,
      locale,
      stage: "INTAKE",
      case: createPatientCase(locale),
      messages: [],
      requestTimestamps: [],
    };
    this.sessions.set(id, record);
    return record;
  }

  save(record: SessionRecord): void {
    this.sessions.set(record.id, record);
  }

  recentMessages(record: SessionRecord): ChatMessageRecord[] {
    return record.messages.slice(-MAX_HISTORY_MESSAGES);
  }

  appendMessage(record: SessionRecord, message: ChatMessageRecord): void {
    record.messages.push(message);
  }

  checkAndRecordRate(record: SessionRecord): boolean {
    const now = Date.now();
    record.requestTimestamps = record.requestTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (record.requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    record.requestTimestamps.push(now);
    return true;
  }
}
