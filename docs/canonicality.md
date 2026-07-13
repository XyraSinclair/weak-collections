# Publication canonicality

This file is the release gate for `weak-collections@0.1.0`.

| Area | Requirement | Status | Evidence |
|---|---|---|---|
| Truth | Dead targets leave no JavaScript-visible bookkeeping shells | covered | forced-GC shell-count tests and isolated retention receipt |
| Truth | Map ephemeron behavior, overwrite races, iteration, and clear are preserved | covered | GC, mutation, canary, and model-fuzz batteries |
| First contact | A stranger can install and use all three collections | covered | README install command and first-screen example |
| Depth | Finalization timing, target domain, and memory costs are explicit | covered | README and DESIGN.md |
| Craft | Native and incumbent wins are stated beside this package's wins | covered | throughput and retention tables |
| Stewardship | Tests, build, packed exports, and registry-only development dependencies are gated | named gap | switch `heap-estimate` to the registry after publishing it, before this package ships |

## Named gaps

- Finalization timing and `sizeApprox` are intentionally nondeterministic.
- Weak local symbols are excluded for a uniform Node 18–24 target domain.
- V8 registry high-water memory is not promised to return immediately.
- `heap-estimate` must be published and the temporary sibling dependency removed before release.

## Ruled out

- Exact synchronous size: ruled out by the platform's intentionally unobservable GC timing.
- Native-collection speed: ruled out; shell cleanup and iteration impose measured costs.
