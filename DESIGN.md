# weak-collections — design

## Scope and origin

This is a fresh design, not an extraction. Earlier owner-authored scaffolding
contained two useful ideas: iterable weak collections built from WeakRef
shells, and `IdemWeakRef`, which interns refs so a target identity has one
Set-deduplicatable wrapper while live. It also contained the regression class
this package exists to eliminate:

1. `IterableWeakSet.delete()` deleted its weak lookup before reading the
   associated ref, so it could never remove that ref from the strong Set.
2. The weak-value dictionary had no `FinalizationRegistry`, so dead values
   could never remove their key/shell entries.

The implementations here share no old collection code. They carry forward the
finished `IdemWeakRef` idea and make shell cleanup a tested family invariant.

## Representations

### IterableWeakSet

```text
WeakMap<target, shell>       Set<shell>
                 shell ───▶ IdemWeakRef(target)
```

The weak lookup gives O(1) identity operations. The Set gives insertion-order
iteration without retaining targets. `delete` first reads the shell, then
deletes the weak edge, unregisters the token, and deletes that exact shell.

### IterableWeakMap

```text
WeakMap<key, shell>          Set<shell>
WeakMap<key, value>          shell ───▶ IdemWeakRef(key)
```

The value is intentionally not stored in the iterable shell. If a value points
back to its key, a strong `shell → value → key` path would keep both alive and
destroy WeakMap ephemeron semantics. Keeping values behind `WeakMap<key,
value>` means a key/value cycle can die together. Iteration dereferences the key
once, then uses that live key to read its value.

### WeakValueMap

```text
Map<key, shell>
     shell = { key, IdemWeakRef(value) }
```

Keys have ordinary Map semantics and are retained until delete, clear, or value
finalization. Finalization deletes only if `map.get(shell.key) === shell`; that
identity guard makes a delayed callback from an overwritten entry harmless.

### IdemWeakRef

```text
WeakMap<target, IdemWeakRef(target)>
```

The interning map must be weak-keyed. Its value is itself only a WeakRef to the
key, so the ephemeron value does not form a strong path back to the target.
Repeated construction for a live target returns the same ref instance. After a
target dies, the old ref remains dead if a caller kept it; the target identity
cannot be presented again. A different later object, even with the same shape,
gets a different ref. This is documented and tested rather than inventing an
unobservable “new ref for the same dead target” state.

## Five design rules

### 1. One registry, one token, no dead shells

Each collection instance owns exactly one `FinalizationRegistry`. Every
WeakRef shell is registered once with that registry and the shell itself is the
unregister token. Explicit `delete`, `clear`, overwrite, and eager observation
of a dead ref unregister before unlinking. A delivered finalizer unlinks its
shell from the enumerable Set/Map.

The invariant is:

> After registry drain, no dead target keeps any wrapper reachable from its
> collection; internal shell count equals live member count.

A non-exported symbol hook exposes shell and callback counts to source tests and
the repository probe. It is absent from the package export map. Tests churn
10,000 members through all three classes and pin the exact delete-before-read
bug shape.

`clear()` unregisters every live token before dropping its indexes. A canary
test then collects the former targets and requires that no collection callback
fires.

### 2. Iteration is one-deref and mutation-safe

Every iterator dereferences at most once per step. A successful dereference
keeps the target strongly reachable through that step; a failed dereference is
skipped and opportunistically unlinked. No `has`-then-`deref` sequence creates
a collection race between two weak observations.

The enumerable indexes are native `Set`/`Map` objects, so their mutation rules
carry through: deletion of an unvisited shell skips it, an addition before
iterator exhaustion can be visited, and delete-then-readd creates a new tail
shell that can be observed later. Each individual shell is visited at most once
by one pass; a re-added logical member is a new shell, matching native behavior.

### 3. `sizeApprox`, never `size`

`sizeApprox` is the enumerable shell count: registrations minus explicit
unregistrations, eagerly discovered deaths, and delivered finalizers. It never
undercounts a registered shell, but it may temporarily overcount live targets
between GC proving a target unreachable and the corresponding cleanup job.

An exact synchronous size is unknowable for the same reason described in
[`tuple-keyed-map`'s design](https://github.com/XyraSinclair/tuple-keyed-map/blob/main/DESIGN.md): garbage-collection timing is intentionally unobservable and
nondeterministic. Two legal executions of the same program may deliver a
finalizer at different times. Calling this value `size` would imply a contract
the platform cannot provide.

### 4. Symbols follow platform target discipline

Registered symbols (`Symbol.for`) are not valid WeakRef/WeakMap targets and are
rejected with a role-specific `TypeError`. The public weak-target APIs use
`T/K/V extends object`; for Node 18 compatibility, local symbols are also
outside this family's weak-target domain even on newer engines that implement
weak local symbols. `WeakValueMap` keys are strong Map keys, so local,
registered, and well-known symbols are all valid there.

### 5. Zero runtime dependencies

The shipped code uses only `WeakRef`, `WeakMap`, `WeakSet`-family semantics,
`Map`, `Set`, and `FinalizationRegistry`. Benchmark and receipt packages are
development-only. `heap-estimate` is temporarily a `file:../heap-estimate`
devDependency; TODO after its npm release: replace it with `^0.1.0` before
publishing this package.

## Why finalization rather than traversal alone

Iteration can opportunistically remove a dead ref, but a collection that is
rarely iterated would retain an unbounded number of wrappers. This is exactly
what the retention probe observes in `iterable-weak-map`: all targets die, yet
20,000 shells remain. The registry makes cleanup independent of future reads.

Finalization is asynchronous and carries real cost. The receipts show add paths
around 10–11× slower than native weak collections and a V8 heap high-water delta
of 1.03–2.03 MiB after 20,000 entries, even with zero JavaScript-visible dead
shells. The native `weak-value-map` add-on retains only 0.07 MiB in the same
probe. Those are representation costs, not benchmark noise to hide.

## Verification doctrine

1. **Contracts:** identity, SameValueZero strong keys, stored `undefined`,
   chaining, constructors, mutation during iteration, clear, and registered
   symbol errors.
2. **GC behavior:** forked workers with `--expose-gc`; target receipts, live-only
   iteration, key/value cycle collection, all-three shell equality, and clear
   unregister canaries.
3. **Regression pin:** delete then inspect the non-public shell count, without
   allowing a later traversal to mask a leaked wrapper.
4. **Oracle fuzz:** strong object pools are the explicit alive set. Random
   add/delete/death batches are mirrored into strong live-view models; after
   every forced-GC/registry drain, observable sorted state and shell counts must
   match.
5. **External receipts:** cyclebench interleaves candidates and cross-checks
   results; the retention probe uses five isolated processes, external
   finalization receipts, `heap-estimate`, and `process.memoryUsage`.

## Limits

- GC and registry scheduling remain nondeterministic. `sizeApprox` and the
  moment an entry disappears cannot be used as a clock.
- Calling `deref()` necessarily keeps a target alive until the end of the
  current job; iteration therefore delays collection of yielded members in the
  platform-defined way.
- FinalizationRegistry capacity is engine-managed. Shell freedom does not
  promise that V8 immediately returns its internal high-water allocation.
- Weak targets are objects/functions across the supported Node 18–24 range;
  newer engines' weak local-symbol extension is intentionally not exposed.

