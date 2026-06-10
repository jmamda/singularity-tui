/**
 * iCalendar (.ics) generator. Writes RFC-5545-compliant single-event files
 * Singularity hands off via the shadowfs pipeline.
 */

export interface CalendarEvent {
  title: string;
  start: Date;
  /** Duration in minutes. */
  durationMinutes: number;
  description?: string;
  location?: string;
}

function fmtIcsTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@singularity-tui`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function renderIcs(event: CalendarEvent): string {
  const dtStart = fmtIcsTime(event.start);
  const dtEnd = fmtIcsTime(new Date(event.start.getTime() + event.durationMinutes * 60_000));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Singularity CLI//ics//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTAMP:${fmtIcsTime(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR', '');
  return lines.join('\r\n');
}

export function parseDuration(input: string): number | null {
  // Accepts "60m", "1h", "1h30m", "2h"
  const m = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  return h * 60 + min;
}

export function parseStart(input: string): Date | null {
  // Accept ISO 8601 datetime
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
