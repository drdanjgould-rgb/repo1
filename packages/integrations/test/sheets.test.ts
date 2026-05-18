import { describe, expect, it } from 'vitest';
import { FakeSheetsClient } from '../src/test-utils/fake-sheets.js';

describe('FakeSheetsClient', () => {
  it('records appended rows and returns the row index', async () => {
    const sh = new FakeSheetsClient();
    const r1 = await sh.appendRow({
      spreadsheetId: 's1',
      range: 'Leads!A1',
      values: ['Sarah Johnson', 'sarah@x.com', 75, 'hot'],
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error();
    expect(r1.value.updatedRow).toBe(1);
    const r2 = await sh.appendRow({
      spreadsheetId: 's1',
      range: 'Leads!A1',
      values: ['Another Lead', 'a@b.com', 40, 'warm'],
    });
    if (!r2.ok) throw new Error();
    expect(r2.value.updatedRow).toBe(2);

    const stored = sh.rows.get('s1:Leads!A1');
    expect(stored).toHaveLength(2);
    expect(stored?.[0]).toEqual(['Sarah Johnson', 'sarah@x.com', '75', 'hot']);
  });

  it('returns scripted errors via failNext', async () => {
    const sh = new FakeSheetsClient();
    sh.failNext = { kind: 'auth', message: 'no token', retryable: false };
    const r = await sh.appendRow({
      spreadsheetId: 's1',
      range: 'A1',
      values: ['x'],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.error.kind).toBe('auth');
  });

  it('keeps rows scoped per (spreadsheet, range) pair', async () => {
    const sh = new FakeSheetsClient();
    await sh.appendRow({ spreadsheetId: 'A', range: 'X!A1', values: ['x'] });
    await sh.appendRow({ spreadsheetId: 'B', range: 'X!A1', values: ['y'] });
    await sh.appendRow({ spreadsheetId: 'A', range: 'Y!A1', values: ['z'] });
    expect(sh.rows.get('A:X!A1')).toHaveLength(1);
    expect(sh.rows.get('B:X!A1')).toHaveLength(1);
    expect(sh.rows.get('A:Y!A1')).toHaveLength(1);
  });
});
