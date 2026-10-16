import { DONE, type Effect, type Instance, type KernelEvent, type Label, type NodeId, type StepResult, type Template } from './types';

/** Upper bound on control-node resolutions in one step; validation should make this unreachable. */
const MAX_CASCADE = 10_000;

/** Creates a new run of `template` (the "new" of the class/object analogy) and activates its start nodes. */
export function instantiate(template: Template, params: Record<string, unknown> = {}): StepResult {
  const run = new Run(template, {
    templateId: template.id,
    templateVersion: template.version,
    params: structuredClone(params),
    status: 'running',
    active: {},
    arrivals: {},
    pending: {},
    timers: {},
    seq: 0,
  });
  for (const id of template.start) run.activate(id);
  return run.finish();
}

/** Applies one event to an instance. Pure: the input instance is never mutated. */
export function step(template: Template, instance: Instance, event: KernelEvent): StepResult {
  if (instance.templateId !== template.id || instance.templateVersion !== template.version) {
    throw new Error(
      `instance belongs to ${instance.templateId}@${instance.templateVersion}, not ${template.id}@${template.version}`,
    );
  }
  if (instance.status === 'ended') return ignored(instance, 'instance has ended');

  const run = new Run(template, structuredClone(instance));
  const s = run.state;

  switch (event.kind) {
    case 'outcome': {
      if (!s.active[event.node]) return ignored(instance, `node "${event.node}" is not active`);
      if (template.nodes[event.node]?.kind === 'control') {
        return ignored(instance, `node "${event.node}" is a control node`);
      }
      run.resolve(event.node, event.label);
      break;
    }
    case 'deliveryDue': {
      const delivery = s.pending[event.id];
      if (!delivery) return ignored(instance, `no pending delivery "${event.id}"`);
      delete s.pending[event.id];
      run.deliver(delivery.from, delivery.to);
      break;
    }
    case 'timerFired': {
      const timer = s.timers[event.id];
      if (!timer) return ignored(instance, `no armed timer "${event.id}"`);
      delete s.timers[event.id];
      const active = s.active[timer.node];
      if (active) active.timers = active.timers.filter((id) => id !== event.id);
      run.resolve(timer.node, timer.label);
      break;
    }
  }
  return run.finish();
}

function ignored(instance: Instance, reason: string): StepResult {
  return { instance, effects: [], ignored: reason };
}

/** Mutable working copy for the duration of a single step. */
class Run {
  readonly effects: Effect[] = [];
  private readonly controlQueue: NodeId[] = [];

  constructor(
    private readonly t: Template,
    readonly state: Instance,
  ) {}

  /** The node emitted `label`: end it unless the label is a signal, then follow matching links. */
  resolve(node: NodeId, label: Label): void {
    // Deactivate before delivering so a self-loop (A -> A) re-activates instead of merging.
    if (!this.t.signals.includes(label)) this.deactivate(node, label);

    for (const link of this.t.outgoing[node] ?? []) {
      if (link.on !== label) continue;
      if (link.delay) {
        const id = `d${++this.state.seq}`;
        this.state.pending[id] = { from: node, to: link.to };
        this.effects.push({ kind: 'scheduleDelivery', id, after: link.delay });
      } else {
        this.deliver(node, link.to);
      }
    }
  }

  /** A token from `from` reaches `to`; activate `to` if its activation rule is satisfied. */
  deliver(from: NodeId, to: NodeId): void {
    const rule = this.t.nodes[to]?.activation ?? 'any';
    if (rule === 'any') {
      this.activate(to);
      return;
    }
    const arrived = this.state.arrivals[to] ?? [];
    if (!arrived.includes(from)) arrived.push(from);
    const needed = rule === 'all' ? this.t.sources[to]!.length : rule.atLeast;
    if (arrived.length >= needed) {
      delete this.state.arrivals[to];
      this.activate(to);
    } else {
      this.state.arrivals[to] = arrived;
    }
  }

  activate(id: NodeId): void {
    if (this.state.active[id]) return; // merge: a node is active at most once per instance
    const node = this.t.nodes[id]!;
    this.state.active[id] = { timers: [] };

    if (node.kind === 'control') {
      this.controlQueue.push(id);
      return;
    }
    this.effects.push(node.payload === undefined ? { kind: 'activate', node: id } : { kind: 'activate', node: id, payload: node.payload });
    for (const timer of node.timers ?? []) {
      const tid = `t${++this.state.seq}`;
      this.state.timers[tid] = { node: id, label: timer.label };
      this.state.active[id].timers.push(tid);
      this.effects.push({ kind: 'scheduleTimer', id: tid, node: id, after: timer.after });
    }
  }

  private deactivate(id: NodeId, label: Label): void {
    const active = this.state.active[id];
    if (!active) return;
    for (const tid of active.timers) {
      delete this.state.timers[tid];
      this.effects.push({ kind: 'cancelTimer', id: tid });
    }
    delete this.state.active[id];
    if (this.t.nodes[id]?.kind === 'task') this.effects.push({ kind: 'deactivate', node: id, label });
  }

  finish(): StepResult {
    let resolved = 0;
    while (this.controlQueue.length) {
      if (++resolved > MAX_CASCADE) throw new Error('control node cascade did not settle');
      const id = this.controlQueue.shift()!;
      if (this.state.active[id]) this.resolve(id, DONE);
    }
    if (Object.keys(this.state.active).length === 0 && Object.keys(this.state.pending).length === 0) {
      this.state.status = 'ended';
      this.effects.push({ kind: 'ended' });
    }
    return { instance: this.state, effects: this.effects };
  }
}
