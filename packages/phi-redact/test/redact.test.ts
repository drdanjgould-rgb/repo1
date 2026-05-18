import { describe, expect, it } from 'vitest';
import { redact } from '../src/index.js';

describe('redact — PHI patterns (positive cases)', () => {
  // ─── Email ────────────────────────────────────────────────────────────
  it('redacts a standard email', () => {
    const { redacted, map } = redact('Contact me at sarah@example.com please.');
    expect(redacted).toContain('<<PHI_EMAIL_001>>');
    expect(redacted).not.toContain('sarah@example.com');
    expect(map['<<PHI_EMAIL_001>>']).toBe('sarah@example.com');
  });

  it('redacts an email with subdomain and plus tag', () => {
    const { redacted } = redact('Email: me+tag@mail.gould-plasticsurgery.com');
    expect(redacted).toContain('<<PHI_EMAIL_001>>');
  });

  it('redacts multiple distinct emails with different tokens', () => {
    const { redacted, map } = redact('a@b.com and c@d.com');
    expect(map['<<PHI_EMAIL_001>>']).toBe('a@b.com');
    expect(map['<<PHI_EMAIL_002>>']).toBe('c@d.com');
    expect(redacted).toBe('<<PHI_EMAIL_001>> and <<PHI_EMAIL_002>>');
  });

  it('reuses the same token for the same email repeated', () => {
    const { redacted, map } = redact('Sarah@x.com is my address; Sarah@x.com.');
    expect(Object.keys(map)).toHaveLength(1);
    expect(redacted.match(/<<PHI_EMAIL_001>>/g)).toHaveLength(2);
  });

  // ─── Phone ────────────────────────────────────────────────────────────
  it('redacts (310) 555-1234', () => {
    const { redacted } = redact('Call me at (310) 555-1234 tomorrow');
    expect(redacted).toContain('<<PHI_PHONE_001>>');
  });

  it('redacts 310-555-1234', () => {
    const { redacted } = redact('reach me 310-555-1234');
    expect(redacted).toContain('<<PHI_PHONE_001>>');
  });

  it('redacts 310.555.1234', () => {
    const { redacted } = redact('cell: 310.555.1234');
    expect(redacted).toContain('<<PHI_PHONE_001>>');
  });

  it('redacts 3105551234 (no separators)', () => {
    const { redacted } = redact('My phone is 3105551234');
    expect(redacted).toContain('<<PHI_PHONE_001>>');
  });

  it('redacts +1 (310) 555-1234 (international)', () => {
    const { redacted } = redact('+1 (310) 555-1234');
    expect(redacted).toContain('<<PHI_PHONE_001>>');
  });

  // ─── MRN ──────────────────────────────────────────────────────────────
  it('redacts "MRN: 12345678"', () => {
    const { redacted } = redact('Patient MRN: 12345678');
    expect(redacted).toContain('<<PHI_MRN_001>>');
  });

  it('redacts "MR# 12345"', () => {
    const { redacted } = redact('MR# 12345');
    expect(redacted).toContain('<<PHI_MRN_001>>');
  });

  it('redacts "Patient ID 9876543"', () => {
    const { redacted } = redact('Patient ID 9876543 needs follow-up');
    expect(redacted).toContain('<<PHI_MRN_001>>');
  });

  // ─── DOB ──────────────────────────────────────────────────────────────
  it('redacts labeled DOB', () => {
    const { redacted } = redact('DOB: 01/15/1985');
    expect(redacted).toContain('<<PHI_DOB_001>>');
  });

  it('redacts labeled long-form DOB', () => {
    const { redacted } = redact('Date of Birth: March 5, 1990');
    expect(redacted).toContain('<<PHI_DOB_001>>');
  });

  it('redacts bare MM/DD/YYYY birth date', () => {
    const { redacted } = redact('born 02-14-1978');
    expect(redacted).toContain('<<PHI_DOB_001>>');
  });

  // ─── Address ──────────────────────────────────────────────────────────
  it('redacts a basic street address', () => {
    const { redacted } = redact('I live at 123 Main Street.');
    expect(redacted).toContain('<<PHI_ADDRESS_001>>');
  });

  it('redacts an address with directional + suite', () => {
    const { redacted } = redact('Office: 9201 Wilshire Blvd Suite 200');
    expect(redacted).toContain('<<PHI_ADDRESS_001>>');
  });

  it('redacts an address with Boulevard suffix', () => {
    const { redacted } = redact('436 Roxbury Drive please');
    expect(redacted).toContain('<<PHI_ADDRESS_001>>');
  });

  // ─── ZIP ──────────────────────────────────────────────────────────────
  it('redacts a 5-digit ZIP', () => {
    const { redacted } = redact('Beverly Hills 90210');
    expect(redacted).toContain('<<PHI_ZIP_001>>');
  });

  it('redacts a ZIP+4', () => {
    const { redacted } = redact('Mail to 90210-1234');
    expect(redacted).toContain('<<PHI_ZIP_001>>');
  });

  // ─── Names ────────────────────────────────────────────────────────────
  it('redacts a Title + LastName', () => {
    const { redacted } = redact('Dr. Smith will see you now.');
    expect(redacted).toContain('<<PHI_NAME_001>>');
    expect(redacted).not.toContain('Smith');
  });

  it('redacts First + Last when both are in the name list', () => {
    const { redacted, map } = redact('My surgeon is Daniel Gould.');
    expect(redacted).toContain('<<PHI_NAME_001>>');
    expect(map['<<PHI_NAME_001>>']).toBe('Daniel Gould');
  });

  it('redacts a Hispanic First + Last in the name list', () => {
    const { redacted } = redact('Maria Rodriguez was here');
    expect(redacted).toContain('<<PHI_NAME_001>>');
  });

  it('redacts a single first name with intro context', () => {
    const { redacted } = redact("Hi, my name is Sarah and I'd like info.");
    expect(redacted).toContain('<<PHI_NAME_001>>');
    expect(redacted).not.toContain('Sarah');
  });

  it("redacts a single first name with 'I'm X' context", () => {
    const { redacted } = redact("I'm Jennifer, calling about a consult.");
    expect(redacted).toContain('<<PHI_NAME_001>>');
  });

  // ─── Mixed PHI ────────────────────────────────────────────────────────
  it('redacts multiple PHI kinds in one message', () => {
    const { redacted, map } = redact(
      'Hi, I am Sarah Johnson. Call me at 310-555-1234 or sarah@x.com.',
    );
    expect(redacted).not.toMatch(/Sarah Johnson|310-555-1234|sarah@x\.com/);
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(3);
  });

  it('handles ordering correctly — phone before ZIP, name last', () => {
    const { redacted } = redact('Dr. Smith at 310-555-1234, zip 90210, Daniel Gould referred me.');
    expect(redacted).toMatch(/<<PHI_NAME_/);
    expect(redacted).toMatch(/<<PHI_PHONE_/);
    expect(redacted).toMatch(/<<PHI_ZIP_/);
  });
});

describe('redact — false-positive guards (must NOT redact)', () => {
  it('"John Deere tractor" is a brand, not a person', () => {
    const { redacted, map } = redact('I bought a John Deere tractor.');
    expect(redacted).toContain('John Deere');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('"May 2026" is a future month, not a DOB', () => {
    const { redacted, map } = redact('Surgery is scheduled for May 2026.');
    expect(redacted).toContain('May 2026');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('"Recovery is 2-3 weeks" is a duration, not a phone', () => {
    const { redacted, map } = redact('Recovery typically takes 2-3 weeks.');
    expect(redacted).toContain('2-3 weeks');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('"The ER was busy" is not initials', () => {
    const { redacted, map } = redact('The ER was busy last night.');
    expect(redacted).toBe('The ER was busy last night.');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('bare "1234" is not an MRN without a label', () => {
    const { redacted, map } = redact('Test value 1234 was within range.');
    expect(redacted).toContain('1234');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('"price range $1,000 to $5,000" is not phone or MRN', () => {
    const { redacted, map } = redact('Price range is $1,000 to $5,000.');
    expect(redacted).toContain('$1,000');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('asks "how much does it cost?" with no PHI returns unchanged', () => {
    const { redacted, map } = redact('How much does this procedure cost?');
    expect(redacted).toBe('How much does this procedure cost?');
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe('redact — options', () => {
  it('respects additionalNames.first for clinic-specific names', () => {
    const { redacted } = redact('Patient Xochitl Smith is here.', {
      additionalNames: { first: ['Xochitl'] },
    });
    expect(redacted).toContain('<<PHI_NAME_001>>');
  });

  it('respects blocklist to suppress a false positive', () => {
    const { redacted, map } = redact('Sandra Bullock starred in that movie.', {
      blocklist: ['Sandra Bullock'],
    });
    expect(redacted).toContain('Sandra Bullock');
    expect(Object.keys(map)).toHaveLength(0);
  });
});
