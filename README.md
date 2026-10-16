# freeFlow

A kernel for task workflows modelled as flowcharts: **nodes** joined by **links**.

Each workflow is one graph that holds both its structure and its run state. The kernel is a pure
state machine:

```ts
create(def)        → { graph, effects }
step(graph, event) → { graph, effects, rejected? }
```

It does no I/O and never reads the clock. Adapters carry out the effects (show a task, schedule a
wake-up) and feed results back in as events. Live graphs can be edited through the same `step`.

Node kinds: `start`, `task`, `decision`, `wait`, `join`, `end`. The full spec is in
[docs/kernel-spec.md](docs/kernel-spec.md).

## Example

```ts
import { create, step } from './src/kernel';

let { graph, effects } = create({
  id: 'swim',
  title: 'Swim',
  nodes: [
    { id: 'start', kind: 'start' },
    { id: 'swim', kind: 'task', outcomes: ['completed', 'stopped'] },
    { id: 'rest', kind: 'wait', when: { for: 'P1D' } },
    { id: 'end', kind: 'end', result: 'stopped' },
  ],
  links: [
    { id: 'l1', from: 'start', to: 'swim', on: 'done' },
    { id: 'l2', from: 'swim', to: 'rest', on: 'completed' },
    { id: 'l3', from: 'rest', to: 'swim', on: 'elapsed' },
    { id: 'l4', from: 'swim', to: 'end', on: 'stopped' },
  ],
});
// effects: [activated swim]

({ graph, effects } = step(graph, { kind: 'outcome', node: 'swim', label: 'completed' }));
// effects: [resolved swim, activated rest, schedule rest w1 { for: 'P1D' }]

({ graph, effects } = step(graph, { kind: 'wake', node: 'rest', token: 'w1' }));
// effects: [resolved rest, activated swim]
```

## Development

```sh
npm install
npm test
npm run typecheck
```
