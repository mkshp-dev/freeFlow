export type NodeId = string;
export type LinkId = string;

/** Opaque outcome name. The kernel only matches labels; adapters decide what they mean. */
export type Label = string;

/** Label start and join nodes resolve with. */
export const DONE: Label = 'done';
/** Built-in ending outcome of every task and decision. */
export const CANCELLED: Label = 'cancelled';
/** Wait node outcome when its time has come. */
export const ELAPSED: Label = 'elapsed';
/** Wait node outcome when its rrule has no occurrences left. */
export const EXHAUSTED: Label = 'exhausted';
/** Link label that matches any ending outcome (never a signal). */
export const ANY = '*';

/**
 * A point in time, handed to the adapter as-is. The kernel only checks that it is well-formed.
 * - `at`: absolute ISO 8601 date-time with an offset, e.g. '2026-11-01T09:00+05:30'
 * - `for`: ISO 8601 duration counted from activation, e.g. 'P2D', 'PT3H', 'P1M'
 * - `rrule`: next occurrence after activation (wait nodes only)
 */
export type When = { at: string } | { for: string } | { rrule: string; tz: string };

/** A timer on a task or decision: emits `emit` at `when` if the node is still active. */
export interface Due {
  when: When;
  emit: Label;
}

interface BaseNode {
  /** Chosen by the client, unique within the graph. */
  id: NodeId;
  /** The box label. The kernel never reads it. */
  title?: string;
  /** Opaque to the kernel: notes, priority, tags, external ids. */
  data?: unknown;
}

/** Entry point. Exactly one per graph; resolves with `done` as soon as the graph is created. */
export interface StartNode extends BaseNode {
  kind: 'start';
}

/** Work the user does. Resolves when the user reports one of its outcomes. */
export interface TaskNode extends BaseNode {
  kind: 'task';
  /** Ending outcomes, e.g. ['completed']. `cancelled` is always allowed as well. */
  outcomes: Label[];
  /** Non-ending outcomes, e.g. ['postponed']: the task stays active when it emits one. */
  signals?: Label[];
  due?: Due;
}

/** A question the user answers. Resolves with the chosen option. */
export interface DecisionNode extends BaseNode {
  kind: 'decision';
  /** At least two, e.g. ['yes', 'no']. `cancelled` is always allowed as well. */
  options: Label[];
  due?: Due;
}

/** Holds the flow until `when`. Resolves with `elapsed`, or `exhausted` when an rrule runs out. */
export interface WaitNode extends BaseNode {
  kind: 'wait';
  when: When;
}

/** Waits for all, or at least n, of its distinct source nodes, then resolves with `done`. */
export interface JoinNode extends BaseNode {
  kind: 'join';
  need: 'all' | { atLeast: number };
}

/** Ends the whole graph with `result`, aborting every other active node. */
export interface EndNode extends BaseNode {
  kind: 'end';
  result: Label;
}

export type NodeDef = StartNode | TaskNode | DecisionNode | WaitNode | JoinNode | EndNode;
export type NodeKind = NodeDef['kind'];

export interface Link {
  id: LinkId;
  from: NodeId;
  to: NodeId;
  /** An outcome or signal of `from`, or `*` for any ending outcome. */
  on: Label;
}

/** What a client sends to `create`. */
export interface GraphDef {
  id: string;
  /** The graph's own label, e.g. "Plan trip". The kernel never reads it. */
  title?: string;
  data?: unknown;
  nodes: NodeDef[];
  links: Link[];
}

export type NodeState =
  | { status: 'idle' }
  | { status: 'active'; raised: Label[]; wake?: string }
  | { status: 'resolved'; outcome: Label }
  | { status: 'aborted' };

export interface NodeRuntime {
  state: NodeState;
  /** Times the node has been activated. */
  runs: number;
  /** Join nodes only: distinct sources that have arrived since it last fired. */
  arrived?: NodeId[];
}

/** One workflow: structure and run state together. Plain JSON, safe to persist. */
export interface Graph {
  id: string;
  title?: string;
  data?: unknown;
  nodes: Record<NodeId, NodeDef>;
  links: Record<LinkId, Link>;
  runtime: Record<NodeId, NodeRuntime>;
  status: 'running' | 'ended';
  /** Set by the End node reached, or by `abort`. Missing if the flow ran out on its own. */
  result?: Label;
  /** Counter for wake tokens. */
  seq: number;
}

/** Shallow changes to a node. `id` and `kind` cannot change; a `null` value removes the field. */
export type NodePatch = { [key: string]: unknown };

export type KernelEvent =
  // runtime
  | { kind: 'outcome'; node: NodeId; label: Label }
  | { kind: 'wake'; node: NodeId; token: string; exhausted?: true }
  // edits
  | { kind: 'addNode'; node: NodeDef; activate?: true }
  | { kind: 'updateNode'; id: NodeId; patch: NodePatch }
  | { kind: 'removeNode'; id: NodeId }
  | { kind: 'addLink'; link: Link }
  | { kind: 'removeLink'; id: LinkId }
  | { kind: 'updateGraph'; patch: { title?: string | null; data?: unknown } }
  | { kind: 'activate'; id: NodeId }
  | { kind: 'abort'; result: Label }
  | { kind: 'batch'; events: KernelEvent[] };

export type Effect =
  | { kind: 'activated'; node: NodeId }
  | { kind: 'resolved'; node: NodeId; outcome: Label }
  | { kind: 'raised'; node: NodeId; signal: Label }
  | { kind: 'aborted'; node: NodeId }
  | { kind: 'schedule'; node: NodeId; token: string; when: When }
  | { kind: 'unschedule'; token: string }
  | { kind: 'ended'; result?: Label }
  | { kind: 'reopened' };

export interface StepResult {
  graph: Graph;
  effects: Effect[];
  /** Set when the event was refused; `graph` is then the input graph, unchanged. */
  rejected?: string;
}
