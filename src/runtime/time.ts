import rrulePkg from 'rrule';
import type { When } from '../kernel';

const { rrulestr } = rrulePkg;

/** Epoch milliseconds. */
export type Instant = number;

/** Result of turning a `When` into a real time. `null` means an rrule has no occurrences left. */
export type Resolved = Instant | null;

/**
 * Works out when a `When` falls, relative to `now`.
 * - `at`: the instant itself (may be in the past; callers fire it straight away)
 * - `for`: `now` plus the ISO duration, with calendar units counted in UTC
 * - `rrule`: the first occurrence after `now`, in the rule's time zone. Rules without DTSTART are
 *   anchored at `anchor`, so COUNT keeps counting across repeated activations.
 */
export function resolveWhen(when: When, now: Instant, anchor: Instant = now): Resolved {
  if ('at' in when) return Date.parse(when.at);
  if ('for' in when) return addDuration(now, when.for);
  return nextOccurrence(when.rrule, when.tz, now, anchor);
}

const DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Adds an ISO 8601 duration. Months clamp to the last day: 31 Jan + P1M = 28/29 Feb. */
export function addDuration(from: Instant, iso: string): Instant {
  const m = DURATION.exec(iso);
  if (!m) throw new Error(`invalid ISO duration "${iso}"`);
  const [y, mo, w, d, h, mi, s] = m.slice(1).map((v) => (v ? Number(v) : 0)) as number[];
  const date = new Date(from);

  if (y || mo) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + y! * 12 + mo!);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  if (w || d) date.setUTCDate(date.getUTCDate() + w! * 7 + d!);
  return date.getTime() + ((h! * 60 + mi!) * 60 + s!) * 1000;
}

/** Next occurrence strictly after `after`. rrule works in "floating" wall-clock time, so convert both ways. */
export function nextOccurrence(rule: string, tz: string, after: Instant, anchor: Instant): Resolved {
  const set = rrulestr(rule, { dtstart: new Date(toWall(anchor, tz)) });
  const next = set.after(new Date(toWall(after, tz)), false);
  return next ? fromWall(next.getTime(), tz) : null;
}

/** Offset of `tz` from UTC at `instant`, in ms (e.g. +19_800_000 for Asia/Kolkata). */
export function tzOffset(instant: Instant, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** Wall-clock time in `tz`, encoded as if it were UTC. */
export const toWall = (instant: Instant, tz: string): number => instant + tzOffset(instant, tz);

/** Inverse of `toWall`. Times skipped by a DST jump land just after the jump. */
export function fromWall(wall: number, tz: string): Instant {
  const guess = wall - tzOffset(wall, tz);
  return wall - tzOffset(guess, tz);
}
