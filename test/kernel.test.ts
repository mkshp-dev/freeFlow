import { describe, expect, it } from 'vitest';
import {
  defineTemplate,
  instantiate,
  lintTemplate,
  step,
  TemplateError,
  type Effect,
  type Instance,
  type KernelEvent,
  type NodeDef,
  type Template,
} from '../src/kernel';

const task = (id: string, extra: Partial<NodeDef> = {}): NodeDef => ({ id, kind: 'task', ...extra });
const control = (id: string, extra: Partial<NodeDef> = {}): NodeDef => ({ id, kind: 'control', ...extra });
const DAY = 86_400_000;

/** Small driver that keeps the latest instance and records effects. */
function drive(t: Template, params: Record<string, unknown> = {}) {
  let { instance, effects } = instantiate(t, params);
  return {
    get instance(): Instance {
      return instance;
    },
    effects,
    send(event: KernelEvent) {
      const r = step(t, instance, event);
      instance = r.instance;
      effects = r.effects;
      return r;
    },
    complete(node: string) {
      return this.send({ kind: 'outcome', node, label: 'completed' });
    },
    active: () => Object.keys(instance.active).sort(),
  };
}

const activated = (effects: Effect[]) =>
  effects.flatMap((e) => (e.kind === 'activate' ? [e.node] : [])).sort();
const ended = (effects: Effect[]) => effects.some((e) => e.kind === 'ended');

describe('ordered tasks (chain)', () => {
  const t = defineTemplate({
    id: 'chain',
    start: ['A'],
    nodes: [task('A'), task('B'), task('C')],
    links: [
      { from: 'A', to: 'B', on: 'completed' },
      { from: 'B', to: 'C', on: 'completed' },
    ],
  });

  it('activates one node at a time and ends after the last', () => {
    const d = drive(t);
    expect(activated(d.effects)).toEqual(['A']);
    expect(activated(d.complete('A').effects)).toEqual(['B']);
    expect(d.active()).toEqual(['B']);
    const last = d.complete('B');
    expect(activated(last.effects)).toEqual(['C']);
    const r = d.complete('C');
    expect(ended(r.effects)).toBe(true);
    expect(d.instance.status).toBe('ended');
  });

  it('ends a node on an unwired terminal outcome', () => {
    const d = drive(t);
    const r = d.send({ kind: 'outcome', node: 'A', label: 'deleted' });
    expect(r.effects).toContainEqual({ kind: 'deactivate', node: 'A', label: 'deleted' });
    expect(ended(r.effects)).toBe(true);
  });
});

describe('unordered subtasks (fan-out + join)', () => {
  const t = defineTemplate({
    id: 'checklist',
    start: ['start'],
    nodes: [control('start'), task('A'), task('B'), task('C'), control('join', { activation: 'all' }), task('after')],
    links: [
      { from: 'start', to: 'A', on: 'done' },
      { from: 'start', to: 'B', on: 'done' },
      { from: 'start', to: 'C', on: 'done' },
      { from: 'A', to: 'join', on: 'completed' },
      { from: 'B', to: 'join', on: 'completed' },
      { from: 'B', to: 'join', on: 'deleted' },
      { from: 'C', to: 'join', on: 'completed' },
      { from: 'join', to: 'after', on: 'done' },
    ],
  });

  it('activates all children in parallel', () => {
    const d = drive(t);
    expect(activated(d.effects)).toEqual(['A', 'B', 'C']);
  });

  it('waits for every source before continuing', () => {
    const d = drive(t);
    expect(activated(d.complete('C').effects)).toEqual([]);
    expect(activated(d.complete('A').effects)).toEqual([]);
    expect(d.instance.arrivals.join).toEqual(['C', 'A']);
    expect(activated(d.complete('B').effects)).toEqual(['after']);
    expect(d.instance.arrivals.join).toBeUndefined();
  });

  it('counts a source once even when several of its labels are wired', () => {
    const t2 = defineTemplate({
      id: 'x',
      start: ['B'],
      nodes: [task('B'), task('other'), control('join', { activation: 'all' })],
      links: [
        { from: 'B', to: 'join', on: 'completed' },
        { from: 'B', to: 'join', on: 'deleted' },
        { from: 'other', to: 'join', on: 'completed' },
      ],
    });
    expect(t2.sources.join).toEqual(['B', 'other']);
  });

  it('lets an explicitly wired deletion satisfy the join', () => {
    const d = drive(t);
    d.complete('A');
    d.complete('C');
    const r = d.send({ kind: 'outcome', node: 'B', label: 'deleted' });
    expect(activated(r.effects)).toEqual(['after']);
  });

  it('never fires the join when an unwired branch is deleted', () => {
    const d = drive(t);
    d.complete('B');
    d.complete('C');
    const r = d.send({ kind: 'outcome', node: 'A', label: 'deleted' });
    expect(activated(r.effects)).toEqual([]);
    // Nothing is active and nothing is pending, so the run ends with the join unsatisfied.
    expect(ended(r.effects)).toBe(true);
  });
});

describe('any and atLeast joins', () => {
  const build = (activation: NodeDef['activation']) =>
    defineTemplate({
      id: 'race',
      start: ['A', 'B', 'C'],
      nodes: [task('A'), task('B'), task('C'), task('next', { activation })],
      links: ['A', 'B', 'C'].map((from) => ({ from, to: 'next', on: 'completed' })),
    });

  it('any: first arrival activates, later arrivals merge into the active node', () => {
    const d = drive(build('any'));
    expect(activated(d.complete('B').effects)).toEqual(['next']);
    expect(activated(d.complete('A').effects)).toEqual([]);
    expect(d.active()).toEqual(['C', 'next']);
  });

  it('atLeast 2: activates on the second distinct source', () => {
    const d = drive(build({ atLeast: 2 }));
    expect(activated(d.complete('A').effects)).toEqual([]);
    expect(activated(d.complete('C').effects)).toEqual(['next']);
  });
});

describe('repeated task (self-loop with delay)', () => {
  const t = defineTemplate({
    id: 'habit',
    start: ['swim'],
    nodes: [task('swim', { payload: { title: 'Swimming' } })],
    links: [{ from: 'swim', to: 'swim', on: 'completed', delay: DAY }],
  });

  it('schedules the next occurrence and re-activates when it is due', () => {
    const d = drive(t);
    expect(d.effects).toContainEqual({ kind: 'activate', node: 'swim', payload: { title: 'Swimming' } });

    const r = d.complete('swim');
    expect(r.effects).toContainEqual({ kind: 'scheduleDelivery', id: 'd1', after: DAY });
    expect(d.active()).toEqual([]);
    expect(d.instance.status).toBe('running');

    expect(activated(d.send({ kind: 'deliveryDue', id: 'd1' }).effects)).toEqual(['swim']);
  });

  it('re-activates immediately on an undelayed self-loop', () => {
    const t2 = defineTemplate({
      id: 'loop',
      start: ['A'],
      nodes: [task('A')],
      links: [{ from: 'A', to: 'A', on: 'completed' }],
    });
    const d = drive(t2);
    const r = d.complete('A');
    expect(r.effects.map((e) => e.kind)).toEqual(['deactivate', 'activate']);
    expect(d.active()).toEqual(['A']);
  });

  it('can be stopped by a terminal outcome that is not looped', () => {
    const d = drive(t);
    const r = d.send({ kind: 'outcome', node: 'swim', label: 'deleted' });
    expect(ended(r.effects)).toBe(true);
  });
});

describe('signals and timers', () => {
  const t = defineTemplate({
    id: 'nag',
    signals: ['postponed', 'nag'],
    start: ['A'],
    nodes: [
      task('A', {
        timers: [
          { label: 'nag', after: 2 * DAY },
          { label: 'expired', after: 7 * DAY },
        ],
      }),
      task('reconsider'),
      task('reminder'),
    ],
    links: [
      { from: 'A', to: 'reconsider', on: 'postponed' },
      { from: 'A', to: 'reminder', on: 'nag' },
    ],
  });

  it('arms timers when a task activates', () => {
    const d = drive(t);
    expect(d.effects.filter((e) => e.kind === 'scheduleTimer')).toEqual([
      { kind: 'scheduleTimer', id: 't1', node: 'A', after: 2 * DAY },
      { kind: 'scheduleTimer', id: 't2', node: 'A', after: 7 * DAY },
    ]);
  });

  it('a signal follows its links but keeps the node active', () => {
    const d = drive(t);
    const r = d.send({ kind: 'outcome', node: 'A', label: 'postponed' });
    expect(activated(r.effects)).toEqual(['reconsider']);
    expect(d.active()).toEqual(['A', 'reconsider']);
  });

  it('a signal timer fires once and leaves the node active', () => {
    const d = drive(t);
    const r = d.send({ kind: 'timerFired', id: 't1' });
    expect(activated(r.effects)).toEqual(['reminder']);
    expect(d.instance.active.A).toEqual({ timers: ['t2'] });
  });

  it('a terminal timer ends the node', () => {
    const d = drive(t);
    const r = d.send({ kind: 'timerFired', id: 't2' });
    expect(r.effects).toContainEqual({ kind: 'deactivate', node: 'A', label: 'expired' });
    expect(r.effects).toContainEqual({ kind: 'cancelTimer', id: 't1' });
  });

  it('completing the node cancels its timers, and late timer events are ignored', () => {
    const d = drive(t);
    d.send({ kind: 'outcome', node: 'A', label: 'postponed' }); // keeps the run alive via "reconsider"
    const r = d.complete('A');
    expect(r.effects.filter((e) => e.kind === 'cancelTimer')).toEqual([
      { kind: 'cancelTimer', id: 't1' },
      { kind: 'cancelTimer', id: 't2' },
    ]);
    expect(step(t, d.instance, { kind: 'timerFired', id: 't1' }).ignored).toMatch(/no armed timer/);
  });
});

describe('joins inside cycles', () => {
  // Every round: A and B in parallel, then review, then back to both.
  const t = defineTemplate({
    id: 'weekly',
    start: ['A', 'B'],
    nodes: [task('A'), task('B'), task('review', { activation: 'all' })],
    links: [
      { from: 'A', to: 'review', on: 'completed' },
      { from: 'B', to: 'review', on: 'completed' },
      { from: 'review', to: 'A', on: 'completed' },
      { from: 'review', to: 'B', on: 'completed' },
    ],
  });

  it('resets join progress after firing so the next round waits again', () => {
    const d = drive(t);
    d.complete('A');
    expect(activated(d.complete('B').effects)).toEqual(['review']);
    expect(activated(d.complete('review').effects)).toEqual(['A', 'B']);
    expect(activated(d.complete('A').effects)).toEqual([]);
    expect(activated(d.complete('B').effects)).toEqual(['review']);
  });
});

describe('instances', () => {
  const t = defineTemplate({ id: 'trip', start: ['pack'], nodes: [task('pack')], links: [] });

  it('keeps instances of one template independent', () => {
    const paris = drive(t, { destination: 'Paris' });
    const tokyo = drive(t, { destination: 'Tokyo' });
    paris.complete('pack');
    expect(paris.instance.status).toBe('ended');
    expect(tokyo.instance.status).toBe('running');
    expect(tokyo.instance.params).toEqual({ destination: 'Tokyo' });
  });

  it('never mutates the input instance', () => {
    const { instance } = instantiate(t);
    const before = structuredClone(instance);
    step(t, instance, { kind: 'outcome', node: 'pack', label: 'completed' });
    expect(instance).toEqual(before);
  });

  it('survives a JSON round trip', () => {
    const { instance } = instantiate(t);
    const restored = JSON.parse(JSON.stringify(instance)) as Instance;
    expect(step(t, restored, { kind: 'outcome', node: 'pack', label: 'completed' }).instance.status).toBe('ended');
  });

  it('ignores duplicate and stale events', () => {
    const d = drive(t);
    d.complete('pack');
    expect(d.complete('pack').ignored).toMatch(/ended/);
    expect(step(t, instantiate(t).instance, { kind: 'outcome', node: 'nope', label: 'x' }).ignored).toMatch(/not active/);
    expect(step(t, instantiate(t).instance, { kind: 'deliveryDue', id: 'd9' }).ignored).toMatch(/no pending/);
  });

  it('refuses to step an instance with a different template version', () => {
    const v2 = defineTemplate({ id: 'trip', version: 2, start: ['pack'], nodes: [task('pack')], links: [] });
    const { instance } = instantiate(t);
    expect(() => step(v2, instance, { kind: 'outcome', node: 'pack', label: 'completed' })).toThrow(/trip@1/);
  });

  it('freezes templates', () => {
    expect(Object.isFrozen(t.nodes.pack)).toBe(true);
  });
});

describe('template validation', () => {
  const errorsOf = (fn: () => unknown): string[] => {
    try {
      fn();
    } catch (e) {
      if (e instanceof TemplateError) return e.errors;
      throw e;
    }
    return [];
  };

  it('reports every structural error at once', () => {
    const errors = errorsOf(() =>
      defineTemplate({
        id: 'bad',
        start: ['missing'],
        nodes: [task('A'), task('A'), control('C', { timers: [{ label: 'x', after: 1 }] }), task('J', { activation: { atLeast: 3 } })],
        links: [
          { from: 'A', to: 'ghost', on: 'completed' },
          { from: 'C', to: 'A', on: 'completed' },
          { from: 'A', to: 'J', on: 'completed', delay: -1 },
        ],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'duplicate node id "A"',
        'start node "missing" does not exist',
        'link A -[completed]-> ghost: target node does not exist',
        'link C -[completed]-> A: control nodes only emit "done", so this link can never fire',
        'link A -[completed]-> J: delay must be a non-negative number',
        'node "C": control nodes cannot have timers',
        'node "J": atLeast must be an integer between 1 and 1',
      ]),
    );
  });

  it('rejects join rules without incoming links', () => {
    expect(errorsOf(() => defineTemplate({ id: 'x', start: ['A'], nodes: [task('A', { activation: 'all' })], links: [] }))).toEqual([
      'node "A": join rule needs incoming links',
    ]);
  });

  it('rejects zero-delay control cycles but allows delayed ones', () => {
    const def = (delay?: number) => ({
      id: 'x',
      start: ['P'],
      nodes: [control('P'), control('Q')],
      links: [
        { from: 'P', to: 'Q', on: 'done' },
        { from: 'Q', to: 'P', on: 'done', delay },
      ],
    });
    expect(errorsOf(() => defineTemplate(def()))[0]).toMatch(/zero-delay cycle \(P -> Q -> P\)/);
    expect(errorsOf(() => defineTemplate(def(1000)))).toEqual([]);
  });

  it('rejects "done" as a signal', () => {
    expect(errorsOf(() => defineTemplate({ id: 'x', signals: ['done'], start: ['A'], nodes: [task('A')], links: [] }))[0]).toMatch(
      /cannot be a signal/,
    );
  });

  it('warns about unreachable nodes', () => {
    const t = defineTemplate({ id: 'x', start: ['A'], nodes: [task('A'), task('orphan')], links: [] });
    expect(lintTemplate(t)).toEqual(['node "orphan" is unreachable from the start nodes']);
  });
});
