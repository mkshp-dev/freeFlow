# freeFlow

A kernel for task workflows modelled as graphs of **nodes** and **links**.

- **Template** (the "class"): an immutable, versioned graph. Built with `defineTemplate`.
- **Instance** (the "object"): one run of a template, with its own state. Created with `instantiate`, advanced with `step`.

The kernel is a pure state machine: `step(template, instance, event) → { instance, effects }`.
It does no I/O and never reads the clock. Adapters carry out the effects (create a task,
schedule a timer) and feed results back in as events.

## Concepts

| Concept | Meaning |
|---|---|
| `task` node | Waits for an outcome from outside (`completed`, `deleted`, ...) |
| `control` node | Does no work; resolves with `done` the moment it activates (start, join, end) |
| `activation` | `any` (default), `all` (join), or `{ atLeast: n }`, counted over distinct source nodes |
| link | `from --on: label [delay]--> to` |
| `signals` | Labels that leave the node active (e.g. `postponed`). All other labels end the node |
| `timers` | A node emits `label` after `after` ms if it is still active |

Rules:
- A node is active at most once per instance. A second arrival while it is active merges into it.
- Join progress resets when the join fires, so joins work inside cycles.
- An instance ends when no node is active and no delayed delivery is pending.
- Events for inactive nodes, unknown timers or deliveries, or ended instances are ignored (`result.ignored`).

## Example

```ts
import { defineTemplate, instantiate, step } from './src/kernel';

const habit = defineTemplate({
  id: 'swim',
  start: ['swim'],
  nodes: [{ id: 'swim', kind: 'task' }],
  links: [{ from: 'swim', to: 'swim', on: 'completed', delay: 86_400_000 }],
});

let { instance, effects } = instantiate(habit);           // [activate swim]
({ instance, effects } = step(habit, instance, { kind: 'outcome', node: 'swim', label: 'completed' }));
// [deactivate swim, scheduleDelivery d1 after 1 day]
({ instance, effects } = step(habit, instance, { kind: 'deliveryDue', id: 'd1' }));
// [activate swim]
```

## Development

```sh
npm install
npm test
npm run typecheck
```
