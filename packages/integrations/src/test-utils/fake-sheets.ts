import { err, ok, type IntegrationError, type Result } from '../result.js';
import type { AppendRowInput, AppendRowOutput, SheetsClient } from '../sheets/types.js';

/**
 * In-memory fake Sheets. Records every append; lets tests read back what
 * the caller wrote without touching the network.
 */
export class FakeSheetsClient implements SheetsClient {
  readonly calls: AppendRowInput[] = [];
  /** Keyed by `${spreadsheetId}:${range}` → array of rows appended. */
  readonly rows = new Map<string, string[][]>();

  failNext: IntegrationError | null = null;

  appendRow(input: AppendRowInput): Promise<Result<AppendRowOutput>> {
    this.calls.push(input);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.resolve(err(e));
    }
    const key = `${input.spreadsheetId}:${input.range}`;
    const existing = this.rows.get(key) ?? [];
    const row = input.values.map((v) => String(v));
    existing.push(row);
    this.rows.set(key, existing);
    return Promise.resolve(ok({ updatedRow: existing.length }));
  }
}
