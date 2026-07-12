export const collectionDebug = Symbol('weak-collections.debug')

export interface CollectionDebugState {
    /** WeakRef shells still reachable through the collection's enumerable index. */
    readonly shellCount: number
    /** Finalization callbacks observed by this collection. */
    readonly finalizationCount: number
}

export function assertWeakTarget(value: unknown, role: string): asserts value is object {
    if (typeof value === 'symbol' && Symbol.keyFor(value) !== undefined) {
        throw new TypeError(`${role} cannot be a registered symbol`)
    }
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
        throw new TypeError(`${role} must be a non-null object or function`)
    }
}

