import { describe, expect, it } from 'vitest';
import {
  create,
  GraphError,
  lintGraph,
  step,
  type Effect,
  type Graph,
  type GraphDef,
  type KernelEvent,
  type Link,
  type NodeDef,
  type StepResult,
  type When,
} from '../src/kernel';

const start: NodeDef = { id: 'start', kind: 'start' };
const task = (id: string, outcomes = ['completed'], extra: Partial<NodeDef> = {}) =>
  ({ id, kind: 'task', outcomes, ...extra }) as NodeDef;
const decision = (id: string, options: string[]): NodeDef => ({ id, kind: 'decision', options });
const wait = (id: string, when: When): NodeDef => ({ id, kind: 'wait', when });
const join = (id: string, need: 'all' | { atLeast: number } = 'all'): NodeDef => ({ id, kind: 'join', need });
const end = (id: string, result = 'done'): NodeDef => ({ id, kind: 'end', result });
const link = (from: string, to: string, on = 'completed'): Link => ({ id: `${from}-${on}-${to}`, from, to, on });

/** Keeps the latest graph and fails loudly on unexpected rejections. */
function drive(def: GraphDef) {
  let r: StepResult = create(def);
  return {
    get graph(): Graph {
      return r.graph;
    },
    get effects(): Effect[] {
      return r.effects;
    },
    send(event: KernelEvent) {
      const next = step(r.graph, event);
      if (next.rejected) throw new Error(`unexpected rejection: ${next.rejected}`);
      r = next;
      return next;
    },
    try: (event: KernelEvent) => step(r.graph, event),
    outcome(node: string, label = 'completed') {
      return this.send({ kind: 'outcome', node, label });
    },
    wake(node: string, extra: { exhausted?: true } = {}) {
      const state = r.graph.runtime[node]!.state;
      if (state.status !== 'active' || !state.wake) throw new Error(`node "${node}" has no armed wake`);
      return this.send({ kind: 'wake', node, token: state.wake, ...extra });
    },
    status: (id: string) => r.graph.runtime[id]?.state.status,
    active: () => Object.keys(r.graph.runtime).filter((id) => r.graph.runtime[id]!.state.status === 'active').sort(),
  };
}

const activated = (effects: Effect[]) => effects.flatMap((e) => (e.kind === 'activated' ? [e.node] : [])).sort();
const endedWith = (effects: Effect[]) => effects.find((e) => e.kind === 'ended');

describe('case 1: simple todo', () => {
  const def: GraphDef = {
    id: 'todo',
    title: 'Book ticket Mumbai–Pune',
    nodes: [start, task('book', ['completed'], { title: 'Book ticket Mumbai–Pune' }), end('done'), end('cancelled', 'cancelled')],
    links: [link('start', 'book', 'done'), link('book', 'done'), link('book', 'cancelled', 'cancelled')],
  };

  it('activates the task and ends with "done" when it is completed', () => {
    const d = drive(def);
    expect(d.effects).toEqual([{ kind: 'activated', node: 'book' }]);
    const r = d.outcome('book');
    expect(r.effects).toEqual([
      { kind: 'resolved', node: 'book', outcome: 'completed' },
      { kind: 'ended', result: 'done' },
    ]);
    expect(d.graph.status).toBe('ended');
    expect(d.graph.result).toBe('done');
  });

  it('keeps cancelled distinguishable from done', () => {
    const d = drive(def);
    d.outcome('book', 'cancelled');
    expect(d.graph.result).toBe('cancelled');
  });

  it('rejects an outcome the task does not declare and leaves the graph unchanged', () => {
    const d = drive(def);
    const r = d.try({ kind: 'outcome', node: 'book', label: 'complted' });
    expect(r.rejected).toMatch(/no outcome "complted"/);
    expect(r.graph).toBe(d.graph);
  });

  it('reopens an ended graph when a node is activated again', () => {
    const d = drive(def);
    d.outcome('book');
    const r = d.send({ kind: 'activate', id: 'book' });
    expect(r.effects).toEqual([{ kind: 'reopened' }, { kind: 'activated', node: 'book' }]);
    expect(d.graph.status).toBe('running');
    expect(d.graph.result).toBeUndefined();
    expect(d.graph.runtime.book!.runs).toBe(2);
  });

  it('rejects outcomes once the graph has ended', () => {
    const d = drive(def);
    d.outcome('book');
    expect(d.try({ kind: 'outcome', node: 'book', label: 'completed' }).rejected).toBe('graph has ended');
  });
});

describe('case 2: scheduled task', () => {
  it('holds the task back until the wait elapses', () => {
    const at = { at: '2026-10-25T09:00+05:30' };
    const d = drive({
      id: 'rent',
      nodes: [start, wait('hold', at), task('pay'), end('done')],
      links: [link('start', 'hold', 'done'), link('hold', 'pay', 'elapsed'), link('pay', 'done')],
    });
    expect(d.effects).toEqual([
      { kind: 'activated', node: 'hold' },
      { kind: 'schedule', node: 'hold', token: 'w1', when: at },
    ]);
    expect(d.status('pay')).toBe('idle');
    const r = d.wake('hold');
    expect(r.effects).toEqual([
      { kind: 'resolved', node: 'hold', outcome: 'elapsed' },
      { kind: 'activated', node: 'pay' },
    ]);
  });

  it('ignores nothing silently: a stale wake token is rejected', () => {
    const d = drive({
      id: 'rent',
      nodes: [start, wait('hold', { for: 'P1D' }), task('pay')],
      links: [link('start', 'hold', 'done'), link('hold', 'pay', 'elapsed')],
    });
    expect(d.try({ kind: 'wake', node: 'hold', token: 'w99' }).rejected).toMatch(/stale wake/);
  });

  const dueDef = (emit: string, extra: Partial<NodeDef> = {}): GraphDef => ({
    id: 'rent',
    nodes: [start, task('pay', ['completed'], { due: { when: { at: '2026-11-01T09:00Z' }, emit }, ...extra }), end('done')],
    links: [link('start', 'pay', 'done'), link('pay', 'done')],
  });

  it('flags an overdue task with a signal and keeps it open', () => {
    const d = drive(dueDef('overdue', { signals: ['overdue'] }));
    const r = d.wake('pay');
    expect(r.effects).toEqual([{ kind: 'raised', node: 'pay', signal: 'overdue' }]);
    expect(d.graph.runtime.pay!.state).toEqual({ status: 'active', raised: ['overdue'] });
    d.outcome('pay');
    expect(d.graph.result).toBe('done');
  });

  it('closes the task when the due timer emits an ending outcome', () => {
    const d = drive(dueDef('missed', { outcomes: ['completed', 'missed'] }));
    d.wake('pay');
    expect(d.graph.runtime.pay!.state).toEqual({ status: 'resolved', outcome: 'missed' });
  });

  it('cancels the due timer when the task is completed in time', () => {
    const d = drive(dueDef('overdue', { signals: ['overdue'] }));
    const r = d.outcome('pay');
    expect(r.effects).toContainEqual({ kind: 'unschedule', token: 'w1' });
  });
});

describe('case 3: repeated task', () => {
  it('repeats a fixed time after completion until stopped', () => {
    const d = drive({
      id: 'water',
      nodes: [start, task('water', ['completed', 'stopped']), wait('gap', { for: 'P2D' }), end('end', 'stopped')],
      links: [link('start', 'water', 'done'), link('water', 'gap'), link('gap', 'water', 'elapsed'), link('water', 'end', 'stopped')],
    });
    d.outcome('water');
    expect(d.active()).toEqual(['gap']);
    d.wake('gap');
    expect(d.active()).toEqual(['water']);
    expect(d.graph.runtime.water!.runs).toBe(2);
    d.outcome('water', 'stopped');
    expect(d.graph.result).toBe('stopped');
  });

  const weekly: GraphDef = {
    id: 'review',
    nodes: [
      start,
      wait('monday', { rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=7', tz: 'Asia/Kolkata' }),
      task('review'),
      join('last'),
      end('done'),
    ],
    links: [
      link('start', 'monday', 'done'),
      link('monday', 'monday', 'elapsed'),
      link('monday', 'review', 'elapsed'),
      link('monday', 'last', 'exhausted'),
      link('review', 'last', '*'),
      link('last', 'done', 'done'),
    ],
  };

  it('keeps time on its own and starts the task each occurrence', () => {
    const d = drive(weekly);
    const r = d.wake('monday');
    expect(activated(r.effects)).toEqual(['monday', 'review']);
    expect(r.effects).toContainEqual({ kind: 'schedule', node: 'monday', token: 'w2', when: expect.anything() });
    d.outcome('review');
    expect(d.active()).toEqual(['monday']);
  });

  it('carries over a review still open at the next occurrence', () => {
    const d = drive(weekly);
    d.wake('monday');
    const r = d.wake('monday');
    expect(activated(r.effects)).toEqual(['monday']);
    expect(d.graph.runtime.review!.runs).toBe(1);
    expect(d.status('review')).toBe('active');
  });

  it('once the rrule is exhausted, ends after the last review rather than aborting it', () => {
    const d = drive(weekly);
    d.wake('monday');
    d.outcome('review'); // week 1 done: its arrival at the join is recorded
    d.wake('monday'); // week 2 starts: review runs again and withdraws that arrival
    expect(d.graph.runtime.last!.arrived).toBeUndefined();
    const r = d.wake('monday', { exhausted: true });
    expect(r.effects).not.toContainEqual({ kind: 'aborted', node: 'review' });
    expect(d.graph.runtime.last!.arrived).toEqual(['monday']);
    expect(d.graph.status).toBe('running');
    d.outcome('review');
    expect(d.graph.result).toBe('done');
  });

  it('ends at once when the rrule runs out with no review open', () => {
    const d = drive(weekly);
    d.wake('monday');
    d.outcome('review');
    d.wake('monday', { exhausted: true });
    expect(d.graph.result).toBe('done');
  });

  it('rejects exhausted on a wait without an rrule', () => {
    const d = drive({
      id: 'w',
      nodes: [start, wait('gap', { for: 'PT1H' }), task('t')],
      links: [link('start', 'gap', 'done'), link('gap', 't', 'elapsed')],
    });
    const token = (d.graph.runtime.gap!.state as { wake: string }).wake;
    expect(d.try({ kind: 'wake', node: 'gap', token, exhausted: true }).rejected).toMatch(/no rrule/);
  });
});

describe('case 4: task with sub-tasks', () => {
  const trip: GraphDef = {
    id: 'trip',
    title: 'Plan trip',
    nodes: [start, task('ticket'), task('hotel'), task('pack'), join('ready'), end('done')],
    links: [
      link('start', 'ticket', 'done'),
      link('start', 'hotel', 'done'),
      link('start', 'pack', 'done'),
      link('ticket', 'ready', '*'),
      link('hotel', 'ready', '*'),
      link('pack', 'ready', '*'),
      link('ready', 'done', 'done'),
    ],
  };

  it('fans out and waits for every sub-task, counting cancelled ones', () => {
    const d = drive(trip);
    expect(activated(d.effects)).toEqual(['hotel', 'pack', 'ticket']);
    d.outcome('ticket');
    d.outcome('hotel', 'cancelled');
    expect(d.graph.runtime.ready!.arrived).toEqual(['ticket', 'hotel']);
    expect(d.graph.status).toBe('running');
    d.outcome('pack');
    expect(d.graph.result).toBe('done');
  });

  it('adds a sub-task mid-flight and makes the join wait for it', () => {
    const d = drive(trip);
    d.send({
      kind: 'batch',
      events: [
        { kind: 'addNode', node: task('visa'), activate: true },
        { kind: 'addLink', link: link('visa', 'ready', '*') },
      ],
    });
    d.outcome('ticket');
    d.outcome('hotel');
    d.outcome('pack');
    expect(d.graph.status).toBe('running');
    d.outcome('visa');
    expect(d.graph.result).toBe('done');
  });

  it('fires the join when a pending sub-task is removed', () => {
    const d = drive(trip);
    d.outcome('ticket');
    d.outcome('hotel');
    const r = d.send({ kind: 'removeNode', id: 'pack' });
    expect(r.effects).toContainEqual({ kind: 'aborted', node: 'pack' });
    expect(d.graph.result).toBe('done');
  });

  it('counts only the latest result of a source that runs again', () => {
    const d = drive(trip);
    d.outcome('ticket');
    expect(d.graph.runtime.ready!.arrived).toEqual(['ticket']);
    d.send({ kind: 'activate', id: 'ticket' }); // reopened: the earlier arrival no longer counts
    d.outcome('hotel');
    d.outcome('pack');
    expect(d.graph.status).toBe('running');
    d.outcome('ticket');
    expect(d.graph.result).toBe('done');
  });

  it('fires an atLeast join on the nth distinct source', () => {
    const d = drive({ ...trip, nodes: trip.nodes.map((n) => (n.id === 'ready' ? join('ready', { atLeast: 2 }) : n)) });
    d.outcome('ticket');
    expect(d.graph.status).toBe('running');
    d.outcome('pack');
    expect(d.graph.result).toBe('done');
    expect(d.status('hotel')).toBe('aborted');
  });
});

describe('case 5: ordered tasks with branching', () => {
  const visa: GraphDef = {
    id: 'visa',
    nodes: [
      start,
      task('apply'),
      task('interview', ['approved', 'rejected']),
      task('flight'),
      decision('reapply', ['yes', 'no']),
      end('done'),
      end('abandoned', 'abandoned'),
    ],
    links: [
      link('start', 'apply', 'done'),
      link('apply', 'interview'),
      link('interview', 'flight', 'approved'),
      link('flight', 'done'),
      link('interview', 'reapply', 'rejected'),
      link('reapply', 'apply', 'yes'),
      link('reapply', 'abandoned', 'no'),
    ],
  };

  it('follows the approved branch', () => {
    const d = drive(visa);
    d.outcome('apply');
    d.outcome('interview', 'approved');
    d.outcome('flight');
    expect(d.graph.result).toBe('done');
  });

  it('loops back on reapply and ends abandoned on no', () => {
    const d = drive(visa);
    d.outcome('apply');
    d.outcome('interview', 'rejected');
    expect(d.active()).toEqual(['reapply']);
    d.outcome('reapply', 'yes');
    expect(d.active()).toEqual(['apply']);
    expect(d.graph.runtime.apply!.runs).toBe(2);
    d.outcome('apply');
    d.outcome('interview', 'rejected');
    d.outcome('reapply', 'no');
    expect(d.graph.result).toBe('abandoned');
  });
});

describe('ending', () => {
  it('an end node aborts other branches and cancels their timers', () => {
    const d = drive({
      id: 'race',
      nodes: [start, task('a'), task('b', ['completed'], { due: { when: { for: 'P1D' }, emit: 'cancelled' } }), end('done')],
      links: [link('start', 'a', 'done'), link('start', 'b', 'done'), link('a', 'done')],
    });
    const r = d.outcome('a');
    expect(r.effects).toEqual([
      { kind: 'resolved', node: 'a', outcome: 'completed' },
      { kind: 'unschedule', token: 'w1' },
      { kind: 'aborted', node: 'b' },
      { kind: 'ended', result: 'done' },
    ]);
  });

  it('ends without a result when the flow runs out', () => {
    const d = drive({ id: 'dry', nodes: [start, task('a')], links: [link('start', 'a', 'done')] });
    const r = d.outcome('a');
    expect(endedWith(r.effects)).toEqual({ kind: 'ended' });
    expect(d.graph.result).toBeUndefined();
  });

  it('abort ends the graph with the given result', () => {
    const d = drive({ id: 'x', nodes: [start, task('a')], links: [link('start', 'a', 'done')] });
    const r = d.send({ kind: 'abort', result: 'cancelled' });
    expect(r.effects).toEqual([{ kind: 'aborted', node: 'a' }, { kind: 'ended', result: 'cancelled' }]);
  });
});

describe('signals and any-outcome links', () => {
  const def: GraphDef = {
    id: 's',
    nodes: [start, task('a', ['completed'], { signals: ['postponed'] }), task('notify'), task('after')],
    links: [link('start', 'a', 'done'), link('a', 'notify', 'postponed'), link('a', 'after', '*')],
  };

  it('a signal follows its own links but not "*", and the node stays active', () => {
    const d = drive(def);
    const r = d.outcome('a', 'postponed');
    expect(activated(r.effects)).toEqual(['notify']);
    expect(d.status('a')).toBe('active');
    expect(d.status('after')).toBe('idle');
  });

  it('"*" follows any ending outcome', () => {
    const d = drive(def);
    d.outcome('a', 'cancelled');
    expect(d.status('after')).toBe('active');
  });

  it('a raised signal is cleared when the node runs again', () => {
    const d = drive({
      id: 'loop',
      nodes: [start, task('a', ['completed', 'stop'], { signals: ['postponed'] })],
      links: [link('start', 'a', 'done'), link('a', 'a')],
    });
    d.outcome('a', 'postponed');
    d.outcome('a');
    expect(d.graph.runtime.a!.state).toEqual({ status: 'active', raised: [] });
  });
});

describe('edits', () => {
  const def: GraphDef = {
    id: 'e',
    nodes: [start, task('a', ['completed', 'skipped']), task('b'), wait('w', { for: 'P1D' })],
    links: [link('start', 'a', 'done'), link('start', 'w', 'done'), link('a', 'b'), link('a', 'b', 'skipped')],
  };

  it('rejects removing an outcome that a link still uses', () => {
    const d = drive(def);
    const r = d.try({ kind: 'updateNode', id: 'a', patch: { outcomes: ['completed'] } });
    expect(r.rejected).toMatch(/never emits "skipped"/);
  });

  it('allows it when the link is removed in the same batch', () => {
    const d = drive(def);
    d.send({
      kind: 'batch',
      events: [
        { kind: 'updateNode', id: 'a', patch: { outcomes: ['completed'] } },
        { kind: 'removeLink', id: 'a-skipped-b' },
      ],
    });
    expect(d.graph.nodes.a).toMatchObject({ outcomes: ['completed'] });
  });

  it('a rejected batch changes nothing', () => {
    const d = drive(def);
    const r = d.try({
      kind: 'batch',
      events: [
        { kind: 'outcome', node: 'a', label: 'completed' },
        { kind: 'addLink', link: link('b', 'start') },
      ],
    });
    expect(r.rejected).toMatch(/into a start node/);
    expect(r.graph).toBe(d.graph);
  });

  it('re-arms the timer when an active wait changes its time', () => {
    const d = drive(def);
    const r = d.send({ kind: 'updateNode', id: 'w', patch: { when: { for: 'P2D' } } });
    expect(r.effects).toEqual([
      { kind: 'unschedule', token: 'w1' },
      { kind: 'schedule', node: 'w', token: 'w2', when: { for: 'P2D' } },
    ]);
  });

  it('updates title and data without touching run state, and removes fields with null', () => {
    const d = drive(def);
    d.send({ kind: 'updateNode', id: 'a', patch: { title: 'Call bank', data: { priority: 1 } } });
    d.send({ kind: 'updateNode', id: 'a', patch: { data: null } });
    expect(d.graph.nodes.a).toEqual({ id: 'a', kind: 'task', outcomes: ['completed', 'skipped'], title: 'Call bank' });
    d.send({ kind: 'updateGraph', patch: { title: 'Errands' } });
    expect(d.graph.title).toBe('Errands');
  });

  it('refuses to change a node kind or add a duplicate', () => {
    const d = drive(def);
    expect(d.try({ kind: 'updateNode', id: 'a', patch: { kind: 'wait' } }).rejected).toMatch(/kind cannot change/);
    expect(d.try({ kind: 'addNode', node: task('a') }).rejected).toMatch(/already exists/);
  });

  it('refuses to activate a node that is already active', () => {
    const d = drive(def);
    expect(d.try({ kind: 'activate', id: 'a' }).rejected).toMatch(/already active/);
  });
});

describe('validation', () => {
  const errorsOf = (def: GraphDef): string[] => {
    try {
      create(def);
      return [];
    } catch (e) {
      if (e instanceof GraphError) return e.errors;
      throw e;
    }
  };
  const base = (nodes: NodeDef[], links: Link[] = []): GraphDef => ({ id: 'v', nodes: [start, ...nodes], links });

  it.each<[string, GraphDef, RegExp]>([
    ['two starts', base([{ id: 's2', kind: 'start' }]), /exactly one start node, found 2/],
    ['unknown link label', base([task('a')], [link('start', 'a', 'done'), link('a', 'a', 'finished')]), /never emits "finished"/],
    ['link into start', base([task('a')], [link('start', 'a', 'done'), link('a', 'start')]), /into a start node/],
    ['link out of end', base([end('e'), task('a')], [link('start', 'e', 'done'), link('e', 'a', 'done')]), /out of an end node/],
    ['join without sources', base([join('j')]), /join needs incoming links/],
    ['atLeast too big', base([task('a'), join('j', { atLeast: 2 })], [link('start', 'a', 'done'), link('a', 'j')]), /atLeast 2 exceeds/],
    ['decision with one option', base([decision('d', ['yes'])]), /options needs at least 2/],
    ['cancelled as a signal', base([task('a', ['completed'], { signals: ['cancelled'] })]), /both an ending outcome and a signal/],
    ['due with rrule', base([task('a', ['completed'], { due: { when: { rrule: 'FREQ=DAILY', tz: 'UTC' }, emit: 'completed' } })]), /cannot use an rrule/],
    ['due emits unknown label', base([task('a', ['completed'], { due: { when: { for: 'P1D' }, emit: 'late' } })]), /due emits "late"/],
    ['at without offset', base([wait('w', { at: '2026-11-01T09:00' })]), /ISO date-time with an offset/],
    ['bad duration', base([wait('w', { for: '2 days' })]), /ISO duration/],
    ['zero duration', base([wait('w', { for: 'PT0S' })]), /longer than zero/],
    ['duplicate node id', base([task('a'), task('a')]), /duplicate node id "a"/],
    ['star from start', base([task('a')], [link('start', 'a', '*')]), /never emits "\*"/],
    [
      'instant cycle',
      base(
        [task('a'), join('j1', { atLeast: 1 }), join('j2')],
        [link('start', 'a', 'done'), link('a', 'j1'), link('j1', 'j2', 'done'), link('j2', 'j1', 'done')],
      ),
      /instant nodes form a cycle/,
    ],
  ])('rejects %s', (_, def, pattern) => {
    expect(errorsOf(def).join('\n')).toMatch(pattern);
  });

  it('lints unreachable nodes and a missing end', () => {
    const { graph } = create(base([task('a'), task('orphan')], [link('start', 'a', 'done')]));
    expect(lintGraph(graph)).toEqual([
      'node "orphan" is unreachable from the start node',
      'no end node is reachable, so the graph can only finish by running out, with no result',
    ]);
  });
});

describe('purity', () => {
  const def: GraphDef = {
    id: 'p',
    nodes: [start, task('a'), end('done')],
    links: [link('start', 'a', 'done'), link('a', 'done')],
  };

  it('never mutates the input graph', () => {
    const { graph } = create(def);
    const frozen = deepFreeze(structuredClone(graph));
    expect(() => step(frozen, { kind: 'outcome', node: 'a', label: 'completed' })).not.toThrow();
    expect(frozen.runtime.a!.state.status).toBe('active');
  });

  it('works on a graph that went through JSON', () => {
    const { graph } = create(def);
    const r = step(JSON.parse(JSON.stringify(graph)), { kind: 'outcome', node: 'a', label: 'completed' });
    expect(r.graph.result).toBe('done');
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
