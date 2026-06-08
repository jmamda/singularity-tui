import { describe, it, expect } from 'vitest';
import { renderIcs, parseDuration, parseStart } from '../calendar.js';

describe('parseDuration', () => {
  it('parses minutes', () => expect(parseDuration('60m')).toBe(60));
  it('parses hours', () => expect(parseDuration('1h')).toBe(60));
  it('parses hours + minutes', () => expect(parseDuration('1h30m')).toBe(90));
  it('rejects garbage', () => expect(parseDuration('abc')).toBeNull());
});

describe('parseStart', () => {
  it('parses ISO 8601', () => {
    const d = parseStart('2026-06-05T10:00:00Z');
    expect(d?.getUTCHours()).toBe(10);
  });
  it('rejects garbage', () => expect(parseStart('not a date')).toBeNull());
});

describe('renderIcs', () => {
  it('produces a valid VCALENDAR/VEVENT structure', () => {
    const ics = renderIcs({
      title: 'Test, event;here',
      start: new Date('2026-06-05T10:00:00Z'),
      durationMinutes: 90,
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260605T100000Z');
    expect(ics).toContain('DTEND:20260605T113000Z');
    // commas/semicolons escaped in SUMMARY
    expect(ics).toContain('SUMMARY:Test\\, event\\;here');
  });
});
