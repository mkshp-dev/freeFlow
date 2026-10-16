import { ANY, CANCELLED, DONE, ELAPSED, EXHAUSTED, type Graph, type Label, type Link, type NodeDef, type NodeId, type When } from './types';

export class GraphError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid graph:\n- ${errors.join('\n- ')}`);
    this.name = 'GraphError';
  }
}

/** Labels a node can emit: ending ones resolve it, signals leave it active. */
export function emits(node: NodeDef): { ending: Label[]; signals: Label[] } {
  switch (node.kind) {
    case 'start':
    case 'join':
      return { ending: [DONE], signals: [] };
    case 'task':
      return { ending: unique([...node.outcomes, CANCELLED]), signals: node.signals ?? [] };
    case 'decision':
      return { ending: unique([...node.options, CANCELLED]), signals: [] };
    case 'wait':
      return { ending: 'rrule' in node.when ? [ELAPSED, EXHAUSTED] : [ELAPSED], signals: [] };
    case 'end':
      return { ending: [], signals: [] };
  }
}

/** Nodes that resolve within the same step they activate in. */
export const isInstant = (node: NodeDef) => node.kind === 'start' || node.kind === 'join' || node.kind === 'end';

/** Distinct source nodes linking into `id`, in link order. */
export function sourcesOf(links: Iterable<Link>, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const l of links) if (l.to === id && !out.includes(l.from)) out.push(l.from);
  return out;
}

/** Every structural error in the graph. Empty means valid. */
export function checkGraph(g: Graph): string[] {
  const errors: string[] = [];
  const nodes = Object.values(g.nodes);
  const links = Object.values(g.links);

  if (!g.id) errors.push('graph id is required');
  const starts = nodes.filter((n) => n.kind === 'start');
  if (starts.length !== 1) errors.push(`a graph needs exactly one start node, found ${starts.length}`);

  for (const [key, node] of Object.entries(g.nodes)) {
    if (!node.id || node.id !== key) errors.push(`node "${key}" has a missing or mismatched id`);
    errors.push(...checkNode(node).map((e) => `node "${node.id}": ${e}`));
  }

  const seen = new Set<string>();
  for (const [key, link] of Object.entries(g.links)) {
    const where = `link "${key}" (${link.from} -[${link.on}]-> ${link.to})`;
    if (!link.id || link.id !== key) errors.push(`${where}: missing or mismatched id`);
    const from = g.nodes[link.from];
    const to = g.nodes[link.to];
    if (!from) errors.push(`${where}: source node does not exist`);
    if (!to) errors.push(`${where}: target node does not exist`);
    if (to?.kind === 'start') errors.push(`${where}: nothing can link into a start node`);
    if (from?.kind === 'end') errors.push(`${where}: nothing can link out of an end node`);
    else if (from && !canLinkOn(from, link.on)) {
      const { ending, signals } = emits(from);
      const allowed = [...ending, ...signals, ...(from.kind === 'start' || from.kind === 'join' ? [] : [ANY])];
      errors.push(`${where}: "${from.id}" never emits "${link.on}" (allowed: ${allowed.join(', ')})`);
    }
    const triple = `${link.from}\u0000${link.to}\u0000${link.on}`;
    if (seen.has(triple)) errors.push(`${where}: duplicate of another link`);
    seen.add(triple);
  }

  for (const node of nodes) {
    if (node.kind !== 'join') continue;
    const count = sourcesOf(links, node.id).length;
    if (count === 0) errors.push(`node "${node.id}": a join needs incoming links`);
    else if (typeof node.need === 'object' && node.need.atLeast > count) {
      errors.push(`node "${node.id}": atLeast ${node.need.atLeast} exceeds its ${count} sources`);
    }
  }

  if (errors.length === 0) {
    const cycle = findInstantCycle(g);
    if (cycle) errors.push(`instant nodes form a cycle (${cycle.join(' -> ')}), which would never settle`);
  }
  return errors;
}

/** Valid but probably unintended. */
export function lintGraph(g: Graph): string[] {
  const warnings: string[] = [];
  const start = Object.values(g.nodes).find((n) => n.kind === 'start');
  if (!start) return warnings;
  const reachable = new Set<NodeId>([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of Object.values(g.links)) {
      if (l.from === id && !reachable.has(l.to)) {
        reachable.add(l.to);
        queue.push(l.to);
      }
    }
  }
  for (const id of Object.keys(g.nodes)) {
    if (!reachable.has(id)) warnings.push(`node "${id}" is unreachable from the start node`);
  }
  if (![...reachable].some((id) => g.nodes[id]?.kind === 'end')) {
    warnings.push('no end node is reachable, so the graph can only finish by running out, with no result');
  }
  return warnings;
}

export function canLinkOn(node: NodeDef, on: Label): boolean {
  if (node.kind === 'end') return false;
  if (on === ANY) return node.kind === 'task' || node.kind === 'decision' || node.kind === 'wait';
  const { ending, signals } = emits(node);
  return ending.includes(on) || signals.includes(on);
}

function checkNode(node: NodeDef): string[] {
  const errors: string[] = [];
  const labels = (name: string, list: unknown, min: number) => {
    if (!Array.isArray(list) || list.some((l) => typeof l !== 'string' || l === '' || l === ANY)) {
      errors.push(`${name} must be a list of non-empty labels other than "${ANY}"`);
      return;
    }
    if (new Set(list).size !== list.length) errors.push(`${name} has duplicates`);
    if (list.length < min) errors.push(`${name} needs at least ${min}`);
  };

  switch (node.kind) {
    case 'start':
      break;
    case 'task': {
      labels('outcomes', node.outcomes, 1);
      if (node.signals !== undefined) {
        labels('signals', node.signals, 0);
        const both = (node.signals ?? []).filter((s) => s === CANCELLED || node.outcomes?.includes(s));
        if (both.length) errors.push(`${both.join(', ')} cannot be both an ending outcome and a signal`);
      }
      if (node.due) checkDue(node.due, emits(node), errors);
      break;
    }
    case 'decision':
      labels('options', node.options, 2);
      if (node.due) checkDue(node.due, emits(node), errors);
      break;
    case 'wait':
      errors.push(...checkWhen(node.when, true));
      break;
    case 'join': {
      const need = node.need;
      if (need !== 'all' && !(typeof need === 'object' && Number.isInteger(need?.atLeast) && need.atLeast >= 1)) {
        errors.push('need must be "all" or { atLeast: n } with n >= 1');
      }
      break;
    }
    case 'end':
      if (typeof node.result !== 'string' || node.result === '') errors.push('result must be a non-empty label');
      break;
    default:
      errors.push(`unknown kind "${(node as { kind: unknown }).kind}"`);
  }
  return errors;
}

function checkDue(due: { when: When; emit: Label }, can: { ending: Label[]; signals: Label[] }, errors: string[]) {
  errors.push(...checkWhen(due.when, false).map((e) => `due ${e}`));
  if (!can.ending.includes(due.emit) && !can.signals.includes(due.emit)) {
    errors.push(`due emits "${due.emit}", which is not one of its outcomes or signals`);
  }
}

const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DURATION = /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

function checkWhen(when: When | undefined, allowRrule: boolean): string[] {
  if (!when || typeof when !== 'object') return ['when is required'];
  const keys = Object.keys(when);
  if ('at' in when && keys.length === 1) {
    return AT.test(when.at) ? [] : [`when.at "${when.at}" must be an ISO date-time with an offset`];
  }
  if ('for' in when && keys.length === 1) {
    if (!DURATION.test(when.for)) return [`when.for "${when.for}" must be an ISO duration such as P2D`];
    return /[1-9]/.test(when.for) ? [] : ['when.for must be longer than zero'];
  }
  if ('rrule' in when && 'tz' in when && keys.length === 2) {
    if (!allowRrule) return ['cannot use an rrule (only wait nodes repeat)'];
    if (typeof when.rrule !== 'string' || !when.rrule) return ['when.rrule must be a non-empty string'];
    if (typeof when.tz !== 'string' || !when.tz) return ['when.tz must be a time zone name'];
    return [];
  }
  return ['when must be exactly one of { at }, { for } or { rrule, tz }'];
}

/** A cycle through start/join/end nodes only would resolve forever inside one step. */
function findInstantCycle(g: Graph): NodeId[] | null {
  const state: Record<NodeId, 'visiting' | 'done'> = {};
  const path: NodeId[] = [];
  const links = Object.values(g.links);

  const visit = (id: NodeId): NodeId[] | null => {
    if (state[id] === 'done') return null;
    if (state[id] === 'visiting') return [...path.slice(path.indexOf(id)), id];
    state[id] = 'visiting';
    path.push(id);
    for (const l of links) {
      const to = g.nodes[l.to];
      if (l.from === id && to && isInstant(to)) {
        const cycle = visit(l.to);
        if (cycle) return cycle;
      }
    }
    path.pop();
    state[id] = 'done';
    return null;
  };

  for (const node of Object.values(g.nodes)) {
    if (isInstant(node)) {
      const cycle = visit(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
