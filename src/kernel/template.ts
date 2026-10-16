import { DONE, type LinkDef, type NodeDef, type NodeId, type Template, type TemplateDef } from './types';

export class TemplateError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid template:\n- ${errors.join('\n- ')}`);
    this.name = 'TemplateError';
  }
}

/** Validates a template definition and returns an immutable Template. Throws TemplateError on any error. */
export function defineTemplate(def: TemplateDef): Template {
  const errors: string[] = [];
  const nodes: Record<NodeId, NodeDef> = {};
  const outgoing: Record<NodeId, LinkDef[]> = {};
  const sources: Record<NodeId, NodeId[]> = {};
  const signals = def.signals ?? [];
  const version = def.version ?? 1;

  if (!def.id) errors.push('template id is required');
  if (!Number.isInteger(version) || version < 1) errors.push('version must be a positive integer');
  if (signals.includes(DONE)) errors.push(`"${DONE}" cannot be a signal: control nodes must end when they resolve`);

  for (const node of def.nodes) {
    if (nodes[node.id]) errors.push(`duplicate node id "${node.id}"`);
    nodes[node.id] = node;
    outgoing[node.id] = [];
    sources[node.id] = [];
  }

  if (def.start.length === 0) errors.push('at least one start node is required');
  for (const id of def.start) {
    if (!nodes[id]) errors.push(`start node "${id}" does not exist`);
  }

  for (const link of def.links) {
    const where = `link ${link.from} -[${link.on}]-> ${link.to}`;
    const from = nodes[link.from];
    if (!from) errors.push(`${where}: source node does not exist`);
    if (!nodes[link.to]) errors.push(`${where}: target node does not exist`);
    if (link.delay !== undefined && !(Number.isFinite(link.delay) && link.delay >= 0)) {
      errors.push(`${where}: delay must be a non-negative number`);
    }
    if (from?.kind === 'control' && link.on !== DONE) {
      errors.push(`${where}: control nodes only emit "${DONE}", so this link can never fire`);
    }
    if (from && nodes[link.to]) {
      outgoing[link.from]!.push(link);
      const s = sources[link.to]!;
      if (!s.includes(link.from)) s.push(link.from);
    }
  }

  for (const node of def.nodes) {
    const sourceCount = sources[node.id]?.length ?? 0;
    const rule = node.activation ?? 'any';
    if (rule !== 'any' && sourceCount === 0) {
      errors.push(`node "${node.id}": join rule needs incoming links`);
    }
    if (typeof rule === 'object') {
      if (!Number.isInteger(rule.atLeast) || rule.atLeast < 1 || rule.atLeast > sourceCount) {
        errors.push(`node "${node.id}": atLeast must be an integer between 1 and ${sourceCount}`);
      }
    }
    if (node.kind === 'control' && node.timers?.length) {
      errors.push(`node "${node.id}": control nodes cannot have timers`);
    }
    for (const timer of node.timers ?? []) {
      if (!(Number.isFinite(timer.after) && timer.after > 0)) {
        errors.push(`node "${node.id}": timer "${timer.label}" needs a positive "after"`);
      }
    }
  }

  if (errors.length === 0) {
    const cycle = findInstantControlCycle(nodes, outgoing);
    if (cycle) errors.push(`control nodes form a zero-delay cycle (${cycle.join(' -> ')}), which would never settle`);
  }

  if (errors.length > 0) throw new TemplateError(errors);

  return deepFreeze({ id: def.id, version, start: [...def.start], nodes, links: [...def.links], signals, outgoing, sources });
}

/** Non-fatal problems: things that are valid but probably not what the author meant. */
export function lintTemplate(t: Template): string[] {
  const warnings: string[] = [];
  const reachable = new Set<NodeId>(t.start);
  const queue = [...t.start];
  while (queue.length) {
    for (const link of t.outgoing[queue.shift()!] ?? []) {
      if (!reachable.has(link.to)) {
        reachable.add(link.to);
        queue.push(link.to);
      }
    }
  }
  for (const id of Object.keys(t.nodes)) {
    if (!reachable.has(id)) warnings.push(`node "${id}" is unreachable from the start nodes`);
  }
  return warnings;
}

/** A cycle of control nodes joined by undelayed links would resolve forever inside one step. */
function findInstantControlCycle(
  nodes: Record<NodeId, NodeDef>,
  outgoing: Record<NodeId, LinkDef[]>,
): NodeId[] | null {
  const state: Record<NodeId, 'visiting' | 'done'> = {};
  const path: NodeId[] = [];

  const visit = (id: NodeId): NodeId[] | null => {
    if (state[id] === 'done') return null;
    if (state[id] === 'visiting') return [...path.slice(path.indexOf(id)), id];
    state[id] = 'visiting';
    path.push(id);
    for (const link of outgoing[id] ?? []) {
      if (!link.delay && nodes[link.to]?.kind === 'control') {
        const cycle = visit(link.to);
        if (cycle) return cycle;
      }
    }
    path.pop();
    state[id] = 'done';
    return null;
  };

  for (const node of Object.values(nodes)) {
    if (node.kind === 'control') {
      const cycle = visit(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
