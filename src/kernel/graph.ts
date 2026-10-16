import {
  ANY,
  DONE,
  ELAPSED,
  EXHAUSTED,
  type Effect,
  type Graph,
  type GraphDef,
  type KernelEvent,
  type Label,
  type Link,
  type NodeDef,
  type NodeId,
  type NodePatch,
  type NodeRuntime,
  type StepResult,
  type When,
} from './types';
import { checkGraph, emits, GraphError, isInstant, sourcesOf } from './validate';

/** Upper bound on instant-node resolutions in one step; validation should make this unreachable. */
const MAX_CASCADE = 10_000;

/** Validates a definition, builds the graph and runs its start node. Throws GraphError if invalid. */
export function create(def: GraphDef): StepResult {
  const errors: string[] = [];
  const g: Graph = { id: def.id, nodes: {}, links: {}, runtime: {}, status: 'running', seq: 0 };
  if (def.title !== undefined) g.title = def.title;
  if (def.data !== undefined) g.data = structuredClone(def.data);

  for (const node of def.nodes) {
    if (g.nodes[node.id]) errors.push(`duplicate node id "${node.id}"`);
    g.nodes[node.id] = structuredClone(node);
    g.runtime[node.id] = idle();
  }
  for (const link of def.links) {
    if (g.links[link.id]) errors.push(`duplicate link id "${link.id}"`);
    g.links[link.id] = { ...link };
  }
  errors.push(...checkGraph(g));
  if (errors.length) throw new GraphError(errors);

  const run = new Run(g);
  run.activate(Object.values(g.nodes).find((n) => n.kind === 'start')!.id);
  run.settle(true);
  return { graph: run.g, effects: run.effects };
}

/** Applies one event. Pure: the input graph is never mutated. A refused event returns it unchanged. */
export function step(graph: Graph, event: KernelEvent): StepResult {
  const run = new Run(structuredClone(graph));
  try {
    run.apply(event);
    run.settle(true);
  } catch (e) {
    if (e instanceof Rejection) return { graph, effects: [], rejected: e.message };
    throw e;
  }
  return { graph: run.g, effects: run.effects };
}

class Rejection extends Error {}

function reject(reason: string): never {
  throw new Rejection(reason);
}

const idle = (): NodeRuntime => ({ state: { status: 'idle' }, runs: 0 });

const timerOf = (node: NodeDef): When | undefined =>
  node.kind === 'wait' ? node.when : node.kind === 'task' || node.kind === 'decision' ? node.due?.when : undefined;

/** Mutable working copy for the duration of a single step. */
class Run {
  readonly effects: Effect[] = [];
  private readonly queue: NodeId[] = [];
  private batchDepth = 0;

  constructor(readonly g: Graph) {}

  apply(event: KernelEvent): void {
    switch (event.kind) {
      case 'outcome':
        return this.outcome(event.node, event.label);
      case 'wake':
        return this.wake(event.node, event.token, event.exhausted === true);
      case 'addNode':
        return this.addNode(event.node, event.activate === true);
      case 'updateNode':
        return this.updateNode(event.id, event.patch);
      case 'removeNode':
        return this.removeNode(event.id);
      case 'addLink':
        return this.addLink(event.link);
      case 'removeLink':
        return this.removeLink(event.id);
      case 'updateGraph':
        return this.updateGraph(event.patch);
      case 'activate':
        return this.activateEdit(event.id);
      case 'abort':
        return this.abort(event.result);
      case 'batch':
        return this.batch(event.events);
      default:
        reject(`unknown event kind "${(event as { kind: unknown }).kind}"`);
    }
  }

  // ---- runtime events ----

  private outcome(id: NodeId, label: Label): void {
    this.requireRunning();
    const node = this.requireNode(id);
    if (node.kind !== 'task' && node.kind !== 'decision') reject(`node "${id}" is a ${node.kind}; only tasks and decisions take outcomes`);
    if (this.rt(id).state.status !== 'active') reject(`node "${id}" is not active`);
    const { ending, signals } = emits(node);
    if (!ending.includes(label) && !signals.includes(label)) {
      reject(`node "${id}" has no outcome "${label}" (allowed: ${[...ending, ...signals].join(', ')})`);
    }
    this.resolve(id, label);
    this.settle(false);
  }

  private wake(id: NodeId, token: string, exhausted: boolean): void {
    this.requireRunning();
    const node = this.requireNode(id);
    const state = this.rt(id).state;
    if (state.status !== 'active' || state.wake !== token) reject(`stale wake token "${token}" for node "${id}"`);
    delete state.wake;

    let label: Label;
    if (node.kind === 'wait') {
      if (exhausted && !('rrule' in node.when)) reject(`node "${id}" has no rrule, so it cannot be exhausted`);
      label = exhausted ? EXHAUSTED : ELAPSED;
    } else if ((node.kind === 'task' || node.kind === 'decision') && node.due && !exhausted) {
      label = node.due.emit;
    } else {
      reject(`node "${id}" cannot take this wake`);
    }
    this.resolve(id, label);
    this.settle(false);
  }

  // ---- edits ----

  private addNode(def: NodeDef, activate: boolean): void {
    if (this.g.nodes[def.id]) reject(`node "${def.id}" already exists`);
    this.g.nodes[def.id] = structuredClone(def);
    this.g.runtime[def.id] = idle();
    this.validate();
    if (activate) this.activateEdit(def.id);
  }

  private updateNode(id: NodeId, patch: NodePatch): void {
    const before = this.requireNode(id);
    if ('id' in patch && patch.id !== id) reject('a node id cannot change');
    if ('kind' in patch && patch.kind !== before.kind) reject('a node kind cannot change; remove it and add a new one');

    const after = structuredClone(before) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete after[key];
      else after[key] = structuredClone(value);
    }
    const node = after as unknown as NodeDef;
    this.g.nodes[id] = node;
    this.validate();

    const state = this.rt(id).state;
    if (state.status === 'active' && JSON.stringify(timerOf(before)) !== JSON.stringify(timerOf(node))) {
      this.disarm(id);
      const when = timerOf(node);
      if (when) this.arm(id, when);
    }
    if (node.kind === 'join') this.checkJoin(id);
    this.settle(false);
  }

  private removeNode(id: NodeId): void {
    const node = this.requireNode(id);
    if (this.rt(id).state.status === 'active') {
      this.disarm(id);
      if (!isInstant(node)) this.effects.push({ kind: 'aborted', node: id });
    }
    delete this.g.nodes[id];
    delete this.g.runtime[id];
    for (const link of Object.values(this.g.links)) {
      if (link.from === id || link.to === id) delete this.g.links[link.id];
    }
    for (const rt of Object.values(this.g.runtime)) {
      if (rt.arrived) rt.arrived = rt.arrived.filter((s) => s !== id);
    }
    this.validate();
    this.recheckJoins();
  }

  private addLink(link: Link): void {
    if (this.g.links[link.id]) reject(`link "${link.id}" already exists`);
    this.g.links[link.id] = { ...link };
    this.validate();
    this.recheckJoins();
  }

  private removeLink(id: string): void {
    if (!this.g.links[id]) reject(`link "${id}" does not exist`);
    delete this.g.links[id];
    this.validate();
    this.recheckJoins();
  }

  private updateGraph(patch: { title?: string | null; data?: unknown }): void {
    for (const key of ['title', 'data'] as const) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === null) delete this.g[key];
      else if (key === 'title') {
        if (typeof value !== 'string') reject('title must be a string');
        this.g.title = value;
      } else this.g.data = structuredClone(value);
    }
  }

  /** Reopen or jump: activates a node directly, reopening the graph if it had ended. */
  private activateEdit(id: NodeId): void {
    this.requireNode(id);
    if (this.rt(id).state.status === 'active') reject(`node "${id}" is already active`);
    if (this.g.status === 'ended') {
      this.g.status = 'running';
      delete this.g.result;
      this.effects.push({ kind: 'reopened' });
    }
    this.activate(id);
    this.settle(false);
  }

  private abort(result: Label): void {
    this.requireRunning();
    if (typeof result !== 'string' || !result) reject('abort needs a non-empty result');
    this.finish(result);
  }

  private batch(events: KernelEvent[]): void {
    this.batchDepth++;
    for (const event of events) this.apply(event);
    this.batchDepth--;
    this.validate();
  }

  // ---- mechanics ----

  activate(id: NodeId): void {
    const rt = this.rt(id);
    if (rt.state.status === 'active') return; // merge: a node is active at most once
    const node = this.g.nodes[id]!;
    rt.state = { status: 'active', raised: [] };
    rt.runs++;
    delete rt.arrived;

    if (isInstant(node)) {
      this.queue.push(id);
      return;
    }
    this.effects.push({ kind: 'activated', node: id });
    const when = timerOf(node);
    if (when) this.arm(id, when);
  }

  /** The node emitted `label`: record a signal or resolve it, then follow matching links. */
  private resolve(id: NodeId, label: Label): void {
    const node = this.g.nodes[id]!;
    const rt = this.rt(id);
    const isSignal = emits(node).signals.includes(label);

    if (isSignal) {
      if (rt.state.status === 'active' && !rt.state.raised.includes(label)) rt.state.raised.push(label);
      this.effects.push({ kind: 'raised', node: id, signal: label });
    } else {
      // Resolve before delivering so a self-loop re-activates instead of merging.
      this.disarm(id);
      rt.state = { status: 'resolved', outcome: label };
      if (!isInstant(node)) this.effects.push({ kind: 'resolved', node: id, outcome: label });
    }

    for (const link of Object.values(this.g.links)) {
      if (link.from === id && (link.on === label || (link.on === ANY && !isSignal))) this.deliver(link.from, link.to);
    }
  }

  private deliver(from: NodeId, to: NodeId): void {
    if (this.g.status !== 'running') return;
    if (this.g.nodes[to]?.kind !== 'join') {
      this.activate(to);
      return;
    }
    const rt = this.rt(to);
    const arrived = rt.arrived ?? [];
    if (!arrived.includes(from)) arrived.push(from);
    rt.arrived = arrived;
    this.checkJoin(to);
  }

  /** Fires the join if enough of its current sources have arrived. */
  private checkJoin(id: NodeId): void {
    const node = this.g.nodes[id];
    const rt = this.g.runtime[id];
    if (node?.kind !== 'join' || !rt || this.g.status !== 'running' || rt.state.status === 'active') return;
    const sources = sourcesOf(Object.values(this.g.links), id);
    const arrived = (rt.arrived ?? []).filter((s) => sources.includes(s));
    if (arrived.length === 0) {
      delete rt.arrived;
      return;
    }
    rt.arrived = arrived;
    const needed = node.need === 'all' ? sources.length : node.need.atLeast;
    if (arrived.length >= needed) this.activate(id);
  }

  private recheckJoins(): void {
    for (const id of Object.keys(this.g.nodes)) this.checkJoin(id);
    this.settle(false);
  }

  private arm(id: NodeId, when: When): void {
    const state = this.rt(id).state;
    if (state.status !== 'active') return;
    const token = `w${++this.g.seq}`;
    state.wake = token;
    this.effects.push({ kind: 'schedule', node: id, token, when: structuredClone(when) });
  }

  private disarm(id: NodeId): void {
    const state = this.rt(id).state;
    if (state.status === 'active' && state.wake) {
      this.effects.push({ kind: 'unschedule', token: state.wake });
      delete state.wake;
    }
  }

  /** Ends the graph: aborts every active node and records the result. */
  private finish(result: Label | undefined): void {
    for (const [id, rt] of Object.entries(this.g.runtime)) {
      delete rt.arrived;
      if (rt.state.status !== 'active') continue;
      this.disarm(id);
      rt.state = { status: 'aborted' };
      if (!isInstant(this.g.nodes[id]!)) this.effects.push({ kind: 'aborted', node: id });
    }
    this.queue.length = 0;
    this.g.status = 'ended';
    if (result === undefined) delete this.g.result;
    else this.g.result = result;
    this.effects.push(result === undefined ? { kind: 'ended' } : { kind: 'ended', result });
  }

  /**
   * Resolves queued instant nodes. With `checkDry`, also ends the graph if nothing is left active.
   * Inside a batch only the outermost settle checks for running dry.
   */
  settle(checkDry: boolean): void {
    let resolved = 0;
    while (this.queue.length && this.g.status === 'running') {
      if (++resolved > MAX_CASCADE) throw new Error('instant node cascade did not settle');
      const id = this.queue.shift()!;
      const node = this.g.nodes[id];
      if (!node || this.rt(id).state.status !== 'active') continue;
      if (node.kind === 'end') {
        this.rt(id).state = { status: 'resolved', outcome: node.result };
        this.finish(node.result);
      } else {
        this.resolve(id, DONE);
      }
    }
    if (checkDry && this.batchDepth === 0 && this.g.status === 'running') {
      const anyActive = Object.values(this.g.runtime).some((rt) => rt.state.status === 'active');
      if (!anyActive) this.finish(undefined);
    }
  }

  private validate(): void {
    if (this.batchDepth > 0) return;
    const errors = checkGraph(this.g);
    if (errors.length) reject(errors.join('; '));
  }

  private requireRunning(): void {
    if (this.g.status !== 'running') reject('graph has ended');
  }

  private requireNode(id: NodeId): NodeDef {
    return this.g.nodes[id] ?? reject(`node "${id}" does not exist`);
  }

  private rt(id: NodeId): NodeRuntime {
    return this.g.runtime[id]!;
  }
}
