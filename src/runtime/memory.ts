import { create, step, type Effect, type Graph, type GraphDef, type KernelEvent, type Label, type NodeId, type StepResult } from '../kernel';
import { resolveWhen, type Instant } from './time';

export interface LogEntry {
  at: Instant;
  graph: string;
  event: KernelEvent | { kind: 'create' };
  effects: Effect[];
  rejected?: string;
}

/** Something waiting on the user or the clock, as a task list would show it. */
export interface OpenItem {
  graph: string;
  node: NodeId;
  kind: 'task' | 'decision' | 'wait';
  title?: string;
  raised: Label[];
  /** When its timer fires, if it has one. */
  wakeAt?: Instant;
}

interface Timer {
  graph: string;
  node: NodeId;
  token: string;
  at: Instant;
  exhausted: boolean;
  seq: number;
}

/**
 * Runs graphs in memory against a manual clock. It carries out the kernel's effects: timers are
 * kept in a list and fire as `advance` moves the clock past them. Useful for tests, demos and
 * as the reference for real adapters.
 */
export class MemoryRuntime {
  private readonly graphs = new Map<string, Graph>();
  private readonly timers = new Map<string, Timer>();
  /** First activation time per rrule wait node, so COUNT carries across loops. */
  private readonly anchors = new Map<string, Instant>();
  private timerSeq = 0;
  private time: Instant;
  readonly log: LogEntry[] = [];

  constructor(start: Instant | string = 0) {
    this.time = typeof start === 'string' ? Date.parse(start) : start;
  }

  get now(): Instant {
    return this.time;
  }

  /** Creates and starts a graph. Throws GraphError if the definition is invalid. */
  create(def: GraphDef): Graph {
    if (this.graphs.has(def.id)) throw new Error(`graph "${def.id}" already exists`);
    const r = create(def);
    this.commit(def.id, { kind: 'create' }, r);
    this.drain(this.time);
    return this.graphs.get(def.id)!;
  }

  /** Sends an event to a graph, then fires any timers already due. */
  send(id: string, event: KernelEvent): StepResult {
    const r = this.apply(id, event);
    this.drain(this.time);
    return r;
  }

  /** Moves the clock forward, firing every timer due on the way, in order. */
  advance(ms: number): void {
    if (!(ms >= 0)) throw new Error('the clock only moves forward');
    this.drain(this.time + ms);
  }

  advanceTo(at: Instant | string): void {
    const target = typeof at === 'string' ? Date.parse(at) : at;
    if (target < this.time) throw new Error('the clock only moves forward');
    this.drain(target);
  }

  graph(id: string): Graph | undefined {
    return this.graphs.get(id);
  }

  /** Every active task, decision and wait across running graphs. */
  open(): OpenItem[] {
    const items: OpenItem[] = [];
    for (const g of this.graphs.values()) {
      if (g.status !== 'running') continue;
      for (const [id, rt] of Object.entries(g.runtime)) {
        const node = g.nodes[id]!;
        if (rt.state.status !== 'active' || (node.kind !== 'task' && node.kind !== 'decision' && node.kind !== 'wait')) continue;
        const item: OpenItem = { graph: g.id, node: id, kind: node.kind, raised: [...rt.state.raised] };
        if (node.title !== undefined) item.title = node.title;
        const timer = rt.state.wake ? this.timers.get(key(g.id, rt.state.wake)) : undefined;
        if (timer) item.wakeAt = timer.at;
        items.push(item);
      }
    }
    return items;
  }

  /** Log entries for one graph, oldest first. */
  history(id: string): LogEntry[] {
    return this.log.filter((e) => e.graph === id);
  }

  private apply(id: string, event: KernelEvent): StepResult {
    const g = this.graphs.get(id);
    if (!g) throw new Error(`graph "${id}" does not exist`);
    const r = step(g, event);
    if (r.rejected) {
      this.log.push({ at: this.time, graph: id, event, effects: [], rejected: r.rejected });
      return r;
    }
    this.commit(id, event, r);
    return r;
  }

  private commit(id: string, event: LogEntry['event'], r: StepResult): void {
    this.graphs.set(id, r.graph);
    this.log.push({ at: this.time, graph: id, event, effects: r.effects });
    for (const effect of r.effects) {
      if (effect.kind === 'schedule') {
        const anchorKey = key(id, effect.node);
        if ('rrule' in effect.when && !this.anchors.has(anchorKey)) this.anchors.set(anchorKey, this.time);
        const at = resolveWhen(effect.when, this.time, this.anchors.get(anchorKey));
        this.timers.set(key(id, effect.token), {
          graph: id,
          node: effect.node,
          token: effect.token,
          at: at ?? this.time,
          exhausted: at === null,
          seq: ++this.timerSeq,
        });
      } else if (effect.kind === 'unschedule') {
        this.timers.delete(key(id, effect.token));
      }
    }
  }

  /** Fires due timers in time order up to `target`, then sets the clock to `target`. */
  private drain(target: Instant): void {
    for (;;) {
      let next: Timer | undefined;
      for (const t of this.timers.values()) {
        if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) next = t;
      }
      if (!next) break;
      this.timers.delete(key(next.graph, next.token));
      this.time = Math.max(this.time, next.at);
      const event: KernelEvent = next.exhausted
        ? { kind: 'wake', node: next.node, token: next.token, exhausted: true }
        : { kind: 'wake', node: next.node, token: next.token };
      this.apply(next.graph, event);
    }
    this.time = Math.max(this.time, target);
  }
}

const key = (graph: string, part: string) => `${graph}\u0000${part}`;
