export type NodeId = string;

/** Opaque outcome name. The kernel only matches labels; adapters decide what they mean. */
export type Label = string;

/** Label every control node resolves with, immediately on activation. */
export const DONE: Label = 'done';

/**
 * When a node becomes active in response to incoming arrivals.
 * - `any`: every arrival activates it (chains, loops)
 * - `all`: once every distinct source node has arrived (join)
 * - `{ atLeast: n }`: once n distinct source nodes have arrived (n-of-m join)
 */
export type Activation = 'any' | 'all' | { atLeast: number };

/** Emits `label` from the node `after` ms after it activates, if it is still active. */
export interface TimerDef {
  label: Label;
  after: number;
}

export interface NodeDef {
  id: NodeId;
  /** `task` waits for an outcome from outside; `control` resolves with `done` immediately. */
  kind: 'task' | 'control';
  activation?: Activation;
  timers?: TimerDef[];
  /** Opaque to the kernel; handed to adapters in `activate` effects. */
  payload?: unknown;
}

export interface LinkDef {
  from: NodeId;
  to: NodeId;
  on: Label;
  /** Delay in ms before the token is delivered to `to`. */
  delay?: number;
}

/** What an author writes. */
export interface TemplateDef {
  id: string;
  version?: number;
  /** Nodes activated when an instance is created. */
  start: NodeId[];
  nodes: NodeDef[];
  links: LinkDef[];
  /** Non-terminal labels: the node stays active when it emits one. All other labels end the node. */
  signals?: Label[];
}

/** A validated, immutable template (the "class"). */
export interface Template {
  readonly id: string;
  readonly version: number;
  readonly start: readonly NodeId[];
  readonly nodes: Readonly<Record<NodeId, NodeDef>>;
  readonly links: readonly LinkDef[];
  readonly signals: readonly Label[];
  /** Derived: outgoing links per node, in definition order. */
  readonly outgoing: Readonly<Record<NodeId, readonly LinkDef[]>>;
  /** Derived: distinct source nodes per node, used by join rules. */
  readonly sources: Readonly<Record<NodeId, readonly NodeId[]>>;
}

export interface ActiveNode {
  timers: string[];
}

/** Runtime state of one run of a template (the "object"). Plain JSON, safe to persist. */
export interface Instance {
  templateId: string;
  templateVersion: number;
  params: Record<string, unknown>;
  status: 'running' | 'ended';
  active: Record<NodeId, ActiveNode>;
  /** Partial join progress: source nodes that have arrived so far. */
  arrivals: Record<NodeId, NodeId[]>;
  /** Delayed deliveries in flight. */
  pending: Record<string, { from: NodeId; to: NodeId }>;
  /** Armed timers. */
  timers: Record<string, { node: NodeId; label: Label }>;
  /** Counter for deterministic delivery/timer ids. */
  seq: number;
}

export type KernelEvent =
  | { kind: 'outcome'; node: NodeId; label: Label }
  | { kind: 'deliveryDue'; id: string }
  | { kind: 'timerFired'; id: string };

export type Effect =
  | { kind: 'activate'; node: NodeId; payload?: unknown }
  | { kind: 'deactivate'; node: NodeId; label: Label }
  | { kind: 'scheduleDelivery'; id: string; after: number }
  | { kind: 'scheduleTimer'; id: string; node: NodeId; after: number }
  | { kind: 'cancelTimer'; id: string }
  | { kind: 'ended' };

export interface StepResult {
  instance: Instance;
  effects: Effect[];
  /** Set when the event had no effect (stale, duplicate, or instance already ended). */
  ignored?: string;
}
