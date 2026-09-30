import type { LedgerEntry } from "../common/types";

export class GroundingLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  record(entry: LedgerEntry): void {
    this.entries.set(entry.id, entry);
  }

  recordMany<T extends { id: string }>(kind: LedgerEntry["kind"], sourceTool: string, rows: T[]): void {
    for (const row of rows) {
      this.record({ id: row.id, kind, sourceTool, data: row });
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): LedgerEntry | undefined {
    return this.entries.get(id);
  }

  allIds(): string[] {
    return [...this.entries.keys()];
  }

  entriesOfKind(kind: LedgerEntry["kind"]): LedgerEntry[] {
    return [...this.entries.values()].filter((e) => e.kind === kind);
  }
}
