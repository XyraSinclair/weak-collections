# weak-collections

Collections that let their members die: an iterable weak set, an iterable
weak-key map, and a weak-value map in one zero-dependency family.

```ts
import { IterableWeakMap, IterableWeakSet, WeakValueMap } from 'weak-collections'

const listeners = new IterableWeakSet<object>()
listeners.add(component)
for (const liveComponent of listeners) notify(liveComponent)

const metadata = new IterableWeakMap<object, Metadata>()
metadata.set(component, { mounted: true })

const cache = new WeakValueMap<string, Result>()
cache.set('expensive-query', result)

// Drop component/result: GC may collect them. After finalization, their
// iterable bookkeeping shells are gone too.
```

The defining guarantee is **shell freedom**. Every weak target has one
registered shell and an unregister token. Explicit deletion removes that exact
shell; collection removes it through `FinalizationRegistry`. Once the registry
has drained, no dead target leaves a `WeakRef` wrapper reachable from the
collection.

ESM and TypeScript declarations are included. Node 18+.

## Why this exists

`WeakMap` and `WeakSet` deliberately cannot enumerate their contents. Adding a
`Set<WeakRef<T>>` makes enumeration possible, but it also creates a second
cleanup problem: dead refs remain ordinary, strongly held Set members unless
something removes them. The older `iterable-weak-map` leaves those shells in
place until a cleanup traversal. This package makes cleanup part of the data
structure's invariant.

The family also includes `WeakValueMap`: ordinary primitive or object keys,
weak object values, and live entry iteration. The established `weak-value-map`
native add-on already collects values efficiently; this package competes on a
coherent API, iteration, receipts, portability, and zero runtime dependencies,
not on pretending the incumbent leaks when the measurements say it does not.

## API

```ts
new IterableWeakSet<T extends object>(values?)
set.add(value)                // this — chainable
set.has(value)                // boolean
set.delete(value)             // boolean
set.sizeApprox                // number
set.clear()                   // void
set[Symbol.iterator]()        // live members only

new IterableWeakMap<K extends object, V>(entries?)
map.get(key)                  // V | undefined
map.set(key, value)           // this — chainable
map.has(key)                  // boolean; distinguishes stored undefined
map.delete(key)               // boolean
map.entries() / keys() / values()
map[Symbol.iterator]()        // live [key, value] entries
map.sizeApprox
map.clear()

new WeakValueMap<K, V extends object>(entries?)
map.get(key) / set(key, value) / has(key) / delete(key)
map[Symbol.iterator]()        // live [key, value] entries
map.sizeApprox
map.clear()

new IdemWeakRef(target)       // same ref object for the same live target
```

`sizeApprox` is deliberately not called `size`. It counts registrations that
have not been explicitly removed, observed dead during an operation, or
reported by the registry. A dead target can therefore be included briefly
until its callback runs. JavaScript provides no synchronous way to ask whether
an otherwise unreachable object has been collected.

Iteration dereferences once per step and skips dead targets. Mutation follows
the backing `Set`/`Map` iterator: deleting an unvisited entry skips it; additions
before exhaustion can be visited; deleting and re-adding creates a tail entry.

Weak targets are objects/functions. Registered symbols are rejected with a
specific `TypeError` (and this Node 18-compatible API rejects local symbols as
weak targets too). Symbols are perfectly valid `WeakValueMap` keys because its
keys are held normally.

## GC receipts

`npm run probe` drops 20,000 targets, forces GC, waits for both the observer and
collection registries, then records five isolated processes. `heap-estimate`
walks JavaScript-visible retained graphs; `process.memoryUsage().heapUsed` is
the ground truth that also sees opaque V8/native bookkeeping.

Measured on Node 24.13.1 / V8 13.6, Apple M5 Max, 2026-07-12. Load average at
receipt write was 18.86 / 13.79 / 11.84, so ratios and retention classes matter
more than fine-grained absolute timing.

| collection | targets collected | dead shells | visible retained graph | heap delta |
|---|---:|---:|---:|---:|
| `IterableWeakSet` | 20,000 / 20,000 | **0** | 344 B | 1.53 MiB |
| `IterableWeakMap` | 20,000 / 20,000 | **0** | 384 B | 2.03 MiB |
| `iterable-weak-map` 1.0.0 | 20,000 / 20,000 | **20,000** | 1.08 MiB | 1.75 MiB |
| `WeakValueMap` | 20,000 / 20,000 | **0** | 256 B | 1.03 MiB |
| `weak-value-map` 1.0.1 | 20,000 / 20,000 | opaque | 24 B | **0.07 MiB** |

The honest read: this package eliminates JavaScript-visible dead shells. Its
per-entry `FinalizationRegistry` bookkeeping leaves a larger V8 heap high-water
delta than the native weak-value add-on, and `IterableWeakMap`'s delta is
slightly larger than the leaking incumbent's at this scale even though its
reachable shell graph is empty. Shell freedom is the guarantee; minimal V8
registry capacity is not.

## Throughput receipts

`npm run bench` uses cyclebench to interleave candidates and verify that every
candidate computes the same result. Each timed call performs 500 operations.

| workload | weak-collections | incumbent | native baseline |
|---|---:|---:|---:|
| set add | 180µs | `iterable-weak-set` 5.35ms | `WeakSet` 18.3µs |
| set has | 11.3µs | `iterable-weak-set` 5.12ms | `WeakSet` 4.37µs |
| set iterate | 36.8µs | `iterable-weak-set` 34.5µs (statistical tie) | `Set` 1.36µs |
| map set | 181µs | `iterable-weak-map` 5.43ms | `WeakMap` 16.2µs |
| map get | 11.0µs | `iterable-weak-map` 4.49µs | `WeakMap` 4.53µs |
| map iterate | 46.9µs | `iterable-weak-map` 58.8µs | `Map` 2.56µs |
| weak-value set | 147µs | `weak-value-map` 243µs | `Map` 14.8µs |
| weak-value get | 21.4µs | `weak-value-map` 257µs | `Map` 4.53µs |

Finalization hygiene is not free: adds are about 10–11× native weak
collections and live iteration is roughly 13–27× native strong collection
iteration. In exchange, adds avoid the iterable incumbents' linear scans and
every weak collection has the same cleanup discipline.

Machine metadata, interquartile bands, call counts, and load are committed in
`receipts/`.

## Verification

The test suite runs in Vitest forks with `--expose-gc` and covers:

- Set/Map contracts, constructors, stored `undefined`, chaining, and mutation
  during iteration.
- 10,000-entry churn for every collection, with the internal shell count gated
  on `shells === live members` after registry drain.
- The historical delete-before-read shell leak, pinned for all three classes.
- `clear()` unregister canaries: no callback is allowed after clear.
- A key/value cycle proving `IterableWeakMap` preserves WeakMap ephemeron
  behavior rather than retaining keys through their values.
- `IdemWeakRef` identity, target collection, and post-collection behavior.
- Deterministic model fuzzing across random add/delete/death/GC sequences.

See [DESIGN.md](./DESIGN.md) for the representation and exact invariants.

## Install

```sh
npm install weak-collections
```

MIT © Xyra Sinclair
