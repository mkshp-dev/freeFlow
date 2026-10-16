import { describe, expect, it } from 'vitest';
import type { GraphDef, Link, NodeDef } from '../src/kernel';
import { addDuration, MemoryRuntime, nextOccurrence, resolveWhen } from '../src/runtime';
import { tzOffset } from '../src/runtime/time';

const t = (iso: string) => Date.parse(iso);
const iso = (ms: number | null | undefined) => (ms == null ? ms : new Date(ms).toISOString());
const start: NodeDef = { id: 'start', kind: 'start' };
const link = (from: string, to: string, on = 'completed'): Link => ({ id: `${from}-${on}-${to}`, from, to, on });

describe('time', () => {
  it('adds ISO durations, clamping months to the last day', () => {
    expect(iso(addDuration(t('2026-01-31T10:00Z'), 'P1M'))).toBe('2026-02-28T10:00:00.000Z');
    expect(iso(addDuration(t('2028-01-31T10:00Z'), 'P1M'))).toBe('2028-02-29T10:00:00.000Z');
    expect(iso(addDuration(t('2026-10-16T10:00Z'), 'P1W2DT1H30M'))).toBe('2026-10-25T11:30:00.000Z');
    expect(iso(addDuration(t('2026-10-16T10:00Z'), 'P1Y'))).toBe('2027-10-16T10:00:00.000Z');
  });

  it('reads time zone offsets', () => {
    expect(tzOffset(t('2026-10-16T10:00Z'), 'Asia/Kolkata')).toBe(5.5 * 3600_000);
    expect(tzOffset(t('2026-07-01T10:00Z'), 'Europe/Berlin')).toBe(2 * 3600_000);
    expect(tzOffset(t('2026-12-01T10:00Z'), 'Europe/Berlin')).toBe(1 * 3600_000);
  });

  it('finds the next rrule occurrence in the rule time zone', () => {
    const rule = 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=7;BYMINUTE=0;BYSECOND=0';
    const now = t('2026-10-16T10:00Z'); // a Friday
    expect(iso(nextOccurrence(rule, 'Asia/Kolkata', now, now))).toBe('2026-10-19T01:30:00.000Z'); // Mon 07:00 IST
  });

  it('keeps wall-clock time across a daylight-saving change', () => {
    const rule = 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0';
    const anchor = t('2026-10-24T06:00Z');
    const sat = nextOccurrence(rule, 'Europe/Berlin', anchor, anchor)!;
    expect(iso(sat)).toBe('2026-10-24T07:00:00.000Z'); // 09:00 CEST
    const sun = nextOccurrence(rule, 'Europe/Berlin', sat, anchor)!;
    expect(iso(sun)).toBe('2026-10-25T08:00:00.000Z'); // 09:00 CET, clocks went back overnight
  });

  it('reports an exhausted rule as null, counting from the anchor', () => {
    const rule = 'FREQ=DAILY;COUNT=2;BYHOUR=9;BYMINUTE=0;BYSECOND=0';
    const anchor = t('2026-10-16T00:00Z');
    expect(nextOccurrence(rule, 'UTC', t('2026-10-16T12:00Z'), anchor)).toBe(t('2026-10-17T09:00Z'));
    expect(nextOccurrence(rule, 'UTC', t('2026-10-17T09:00Z'), anchor)).toBeNull();
  });

  it('resolves absolute and relative times', () => {
    const now = t('2026-10-16T10:00Z');
    expect(resolveWhen({ at: '2026-11-01T09:00+05:30' }, now)).toBe(t('2026-11-01T03:30Z'));
    expect(resolveWhen({ for: 'PT3H' }, now)).toBe(t('2026-10-16T13:00Z'));
  });
});

describe('MemoryRuntime', () => {
  it('holds a scheduled task back until its start date', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z');
    rt.create({
      id: 'rent',
      nodes: [
        start,
        { id: 'hold', kind: 'wait', when: { at: '2026-10-25T09:00+05:30' } },
        { id: 'pay', kind: 'task', title: 'Pay rent', outcomes: ['completed'] },
      ],
      links: [link('start', 'hold', 'done'), link('hold', 'pay', 'elapsed')],
    });
    expect(rt.open()).toEqual([{ graph: 'rent', node: 'hold', kind: 'wait', raised: [], wakeAt: t('2026-10-25T03:30Z') }]);

    rt.advanceTo('2026-10-25T03:29Z');
    expect(rt.open().map((i) => i.node)).toEqual(['hold']);
    rt.advance(60_000);
    expect(rt.open()).toEqual([{ graph: 'rent', node: 'pay', kind: 'task', title: 'Pay rent', raised: [] }]);
  });

  const rentDue: GraphDef = {
    id: 'rent',
    nodes: [
      start,
      { id: 'pay', kind: 'task', outcomes: ['completed'], signals: ['overdue'], due: { when: { at: '2026-11-01T09:00Z' }, emit: 'overdue' } },
    ],
    links: [link('start', 'pay', 'done')],
  };

  it('flags a task overdue when its due date passes', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z');
    rt.create(rentDue);
    rt.advanceTo('2026-11-02T00:00Z');
    expect(rt.open()).toEqual([{ graph: 'rent', node: 'pay', kind: 'task', raised: ['overdue'] }]);
  });

  it('drops the due timer when the task is completed in time', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z');
    rt.create(rentDue);
    rt.send('rent', { kind: 'outcome', node: 'pay', label: 'completed' });
    rt.advanceTo('2026-12-01T00:00Z');
    expect(rt.history('rent').map((e) => e.event.kind)).toEqual(['create', 'outcome']);
  });

  it('fires a past start date immediately', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z');
    rt.create({
      id: 'late',
      nodes: [start, { id: 'hold', kind: 'wait', when: { at: '2026-10-01T00:00Z' } }, { id: 'a', kind: 'task', outcomes: ['completed'] }],
      links: [link('start', 'hold', 'done'), link('hold', 'a', 'elapsed')],
    });
    expect(rt.open().map((i) => i.node)).toEqual(['a']);
  });

  it('repeats a task two days after each completion', () => {
    const rt = new MemoryRuntime('2026-10-16T08:00Z');
    rt.create({
      id: 'water',
      nodes: [start, { id: 'water', kind: 'task', outcomes: ['completed'] }, { id: 'gap', kind: 'wait', when: { for: 'P2D' } }],
      links: [link('start', 'water', 'done'), link('water', 'gap'), link('gap', 'water', 'elapsed')],
    });
    rt.advance(3 * 3600_000); // done at 11:00
    rt.send('water', { kind: 'outcome', node: 'water', label: 'completed' });
    expect(rt.open()[0]).toMatchObject({ node: 'gap', wakeAt: t('2026-10-18T11:00Z') });
    rt.advanceTo('2026-10-18T11:00Z');
    expect(rt.open()[0]).toMatchObject({ node: 'water' });
    expect(rt.graph('water')!.runtime.water!.runs).toBe(2);
  });

  it('runs a fixed weekly schedule until its COUNT runs out', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z'); // Friday
    rt.create({
      id: 'review',
      nodes: [
        start,
        { id: 'monday', kind: 'wait', when: { rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=7;BYMINUTE=0;BYSECOND=0;COUNT=3', tz: 'Asia/Kolkata' } },
        { id: 'review', kind: 'task', outcomes: ['completed'] },
        { id: 'last', kind: 'join', need: 'all' },
        { id: 'done', kind: 'end', result: 'done' },
      ],
      links: [
        link('start', 'monday', 'done'),
        link('monday', 'monday', 'elapsed'),
        link('monday', 'review', 'elapsed'),
        link('monday', 'last', 'exhausted'),
        link('review', 'last', '*'),
        link('last', 'done', 'done'),
      ],
    });

    rt.advanceTo('2026-10-19T02:00Z'); // after the first Monday 07:00 IST
    rt.send('review', { kind: 'outcome', node: 'review', label: 'completed' });
    rt.advanceTo('2026-11-03T00:00Z'); // two more Mondays; the second review is skipped and carries over
    const g = rt.graph('review')!;
    expect(g.status).toBe('running'); // the last review is still open, so End waits for it
    expect(g.runtime.monday!.state).toEqual({ status: 'resolved', outcome: 'exhausted' });
    expect(g.runtime.review!.runs).toBe(2);
    expect(rt.open().map((i) => i.node)).toEqual(['review']);

    rt.send('review', { kind: 'outcome', node: 'review', label: 'completed' });
    expect(rt.graph('review')).toMatchObject({ status: 'ended', result: 'done' });
  });

  it('logs rejected events without changing anything', () => {
    const rt = new MemoryRuntime();
    rt.create(rentDue);
    const r = rt.send('rent', { kind: 'outcome', node: 'pay', label: 'nope' });
    expect(r.rejected).toBeDefined();
    expect(rt.log.at(-1)).toMatchObject({ event: { kind: 'outcome' }, rejected: r.rejected });
    expect(rt.open().map((i) => i.node)).toEqual(['pay']);
  });

  it('never moves the clock backwards', () => {
    const rt = new MemoryRuntime('2026-10-16T10:00Z');
    expect(() => rt.advanceTo('2026-10-15T00:00Z')).toThrow(/only moves forward/);
  });
});
