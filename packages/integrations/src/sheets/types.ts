import type { Result } from '../result.js';

export interface AppendRowInput {
  /** Google Sheets spreadsheet ID (the `/d/{id}/` segment of the URL). */
  spreadsheetId: string;
  /** A1-style range, e.g. `Leads!A1` or `Sheet1!A1`. */
  range: string;
  /** Cells to write, left-to-right. Coerced to strings. */
  values: ReadonlyArray<string | number | boolean>;
}

export interface AppendRowOutput {
  /** Row that was appended (1-indexed). */
  updatedRow: number;
}

export interface SheetsClient {
  appendRow(input: AppendRowInput): Promise<Result<AppendRowOutput>>;
}
