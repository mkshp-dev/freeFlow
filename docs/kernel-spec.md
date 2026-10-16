# freeFlow kernel spec

The kernel holds one **graph** per workflow: a flowchart of nodes and links, plus its run state.
It is a pure state machine:

```ts
create(def)          → { graph, effects }            // throws GraphError if def is invalid
step(graph, event)   → { graph, effects, rejected? } // never mutates its input
```

It does no I/O and never reads the clock. Adapters carry out effects (show a task, schedule a
wake-up) and feed results back in as events. There are no templates in the kernel; clients may
keep templates as functions that produce a `GraphDef`.

## Nodes

Every node has `id` (chosen by the client, unique in the graph), `kind`, and optionally `title`
and `data`. The kernel never reads `title` or `data`.

| Kind | Fields | Activates | Resolves | Emits |
|---|---|---|---|---|
| `start` | – | when the graph is created | immediately | `done` |
| `task` | `outcomes`, `signals?`, `due?` | when a link arrives | the user reports an outcome | its outcomes, `cancelled`; signals |
| `decision` | `options` (≥ 2), `due?` | when a link arrives | the user picks an option | its options, `cancelled` |
| `wait` | `when` | when a link arrives | the adapter wakes it | `elapsed`; `exhausted` if `when` is an rrule |
| `join` | `need: 'all' \| { atLeast: n }` | enough distinct sources arrived | immediately | `done` |
| `end` | `result` | when a link arrives | immediately, ending the graph | – |

- A graph has exactly one `start`.
- `cancelled` is a built-in ending outcome of every task and decision.
- **Signals** (tasks only) don't end the node: it stays active and records the signal in `raised`.
- `start`, `join` and `end` are **instant**: they resolve within the step that activates them and
  produce no `activated`/`resolved` effects.

### Time

```ts
type When =
  | { at: string }                  // ISO date-time with offset: '2026-11-01T09:00+05:30'
  | { for: string }                 // ISO duration from activation: 'P2D', 'PT3H', 'P1M'
  | { rrule: string; tz: string };  // next occurrence after activation (wait nodes only)
```

The kernel checks the shape and passes `When` to the adapter untouched. The adapter works out the
real time, including calendar months and daylight-saving changes.

`due: { when, emit }` on a task or decision fires `emit` if the node is still active at `when`.
`emit` must be one of the node's outcomes or signals: `overdue` as a signal flags the task,
`missed` as an outcome closes it. Postponing does not move `due`; the client edits it.

## Links

```ts
{ id, from, to, on }   // on: a label `from` can emit, or '*'
```

- `*` matches any **ending** outcome, never a signal. It is allowed from tasks, decisions and waits.
- Several links on the same label fork into parallel branches.
- A link on a signal starts a branch while the source stays active.
- Links carry no delays; time lives in wait nodes.

## Run state

```ts
NodeRuntime = { state, runs, arrived? }
state = { status: 'idle' }
      | { status: 'active', raised: Label[], wake?: token }
      | { status: 'resolved', outcome }
      | { status: 'aborted' }
Graph       = { ..., status: 'running' | 'ended', result?, seq }
```

- `runs` counts activations, so loops can be counted. Timestamps belong to the adapter's event log.
- `raised` is cleared each time the node activates again.
- `wake` is the token of the node's one timer. A wake with any other token is rejected.
- `arrived` (joins) lists distinct sources since the join last fired.

## Rules

- **Merge:** an arrival at an active node does nothing. A wait already counting down keeps its
  time; an open task carries over.
- **Self-loops:** a node resolves before its links are followed, so `A → A` runs it again.
- **Joins** count distinct source nodes. Progress resets when the join fires.
- **End** aborts every other active node, cancels their timers, and sets the graph's `result`.
- **Running dry:** when no node is active, the graph ends with no `result`. This is allowed;
  `lintGraph` warns when no end node is reachable.

## Events

| Event | Effect on the graph |
|---|---|
| `outcome { node, label }` | Task or decision reports an outcome or signal |
| `wake { node, token, exhausted? }` | Adapter says the node's time has come |
| `addNode { node, activate? }` | Adds a node; `activate` starts it at once (sub-task added mid-flight) |
| `updateNode { id, patch }` | Shallow patch; `null` removes a field; `id` and `kind` are fixed. Re-arms the timer if an active node's time changes |
| `removeNode { id }` | Removes the node and its links; aborts it if active |
| `addLink { link }` / `removeLink { id }` | Joins are re-checked; one may fire immediately |
| `updateGraph { patch }` | Changes the graph's `title` / `data` |
| `activate { id }` | Reopens or jumps to a node; reopens an ended graph |
| `abort { result }` | Ends the graph with `result`, aborting everything active |
| `batch { events }` | All-or-nothing; structure is validated once, at the end |

Runtime events (`outcome`, `wake`) are rejected on an ended graph. Edits are not.

Every edit must leave a valid graph. For example, removing an outcome that a link still uses is
rejected unless the link is removed in the same batch. A rejected event returns the input graph
unchanged with `rejected: reason`.

## Effects

| Effect | Adapter should |
|---|---|
| `activated { node }` | show the task, decision or wait |
| `resolved { node, outcome }` | tick or hide it |
| `raised { node, signal }` | flag it, e.g. as overdue |
| `aborted { node }` | remove it; it was cut off |
| `schedule { node, token, when }` | send `wake { node, token }` at `when` |
| `unschedule { token }` | drop that wake-up |
| `ended { result? }` | mark the workflow finished |
| `reopened` | mark the workflow running again |

## Validation

`create` and every edit run `checkGraph`:

- exactly one start; node and link ids unique
- tasks need ≥ 1 outcome; decisions ≥ 2 options; labels are non-empty, unique, never `*`
- a label can't be both an ending outcome and a signal (`cancelled` is always ending)
- `when` is well-formed; `rrule` only on waits; `due.emit` is an outcome or signal of its node
- links: both ends exist, nothing into a start, nothing out of an end, `on` is a label the
  source can emit, no duplicate `from`/`to`/`on`
- joins have incoming links, and `atLeast` is at most the number of distinct sources
- no cycle made only of instant nodes

`lintGraph` reports what is valid but probably unintended: unreachable nodes and no reachable end.
