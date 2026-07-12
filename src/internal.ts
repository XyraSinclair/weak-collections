export const collectionDebug = Symbol('weak-collections.debug')

export interface CollectionDebugState {
    /** WeakRef shells still reachable through the collection's enumerable index. */
    readonly shellCount: number
    /** Finalization callbacks observed by this collection. */
    readonly finalizationCount: number
}

export function assertWeakTarget(value: unknown, role: string): asserts value is object {
    if (typeof value === 'symbol') {
        if (Symbol.keyFor(value) !== undefined) {
            throw new TypeError(`${role} cannot be a registered symbol`)
        }
        // Local symbols ARE valid ES2023 weak targets; this family excludes
        // them deliberately (v0.1 scope) — say so instead of misclassifying.
        throw new TypeError(
            `${role} cannot be a symbol (local symbols are valid weak targets in ES2023, but this package deliberately excludes them in v0.1)`
        )
    }
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
        throw new TypeError(`${role} must be a non-null object or function`)
    }
}

