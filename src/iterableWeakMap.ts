import { IdemWeakRef } from './idemWeakRef.js'
import { assertWeakTarget, collectionDebug } from './internal.js'
import type { CollectionDebugState } from './internal.js'

interface MapShell<K extends object> {
    readonly ref: IdemWeakRef<K>
}

/** An enumerable Map whose object keys are held weakly. */
export class IterableWeakMap<K extends object, V> implements Iterable<[K, V]> {
    private lookup = new WeakMap<K, MapShell<K>>()
    private valueByKey = new WeakMap<K, V>()
    private readonly shells = new Set<MapShell<K>>()
    private readonly registry: FinalizationRegistry<MapShell<K>>
    private finalized = 0

    constructor(entries?: Iterable<readonly [K, V]> | null) {
        this.registry = new FinalizationRegistry((shell) => {
            this.finalized++
            this.shells.delete(shell)
        })
        if (entries != null) {
            for (const [key, value] of entries) this.set(key, value)
        }
    }

    get(key: K): V | undefined {
        assertWeakTarget(key, 'IterableWeakMap key')
        return this.valueByKey.get(key)
    }

    set(key: K, value: V): this {
        assertWeakTarget(key, 'IterableWeakMap key')
        let shell = this.lookup.get(key)
        if (shell === undefined) {
            shell = { ref: new IdemWeakRef(key) }
            this.lookup.set(key, shell)
            this.shells.add(shell)
            this.registry.register(key, shell, shell)
        }
        // Values live behind a WeakMap edge rather than in the iterable shell.
        // This preserves ephemeron behavior when a value points back to its key.
        this.valueByKey.set(key, value)
        return this
    }

    has(key: K): boolean {
        assertWeakTarget(key, 'IterableWeakMap key')
        return this.lookup.has(key)
    }

    delete(key: K): boolean {
        assertWeakTarget(key, 'IterableWeakMap key')
        const shell = this.lookup.get(key)
        if (shell === undefined) return false

        this.lookup.delete(key)
        this.valueByKey.delete(key)
        this.registry.unregister(shell)
        this.shells.delete(shell)
        return true
    }

    clear(): void {
        for (const shell of this.shells) this.registry.unregister(shell)
        this.shells.clear()
        this.lookup = new WeakMap()
        this.valueByKey = new WeakMap()
    }

    /** Registered entries minus explicit removals and delivered finalizers. */
    get sizeApprox(): number {
        return this.shells.size
    }

    *entries(): IterableIterator<[K, V]> {
        for (const shell of this.shells) {
            const key = shell.ref.deref()
            if (key !== undefined) {
                yield [key, this.valueByKey.get(key) as V]
            } else {
                this.registry.unregister(shell)
                this.shells.delete(shell)
            }
        }
    }

    *keys(): IterableIterator<K> {
        for (const [key] of this.entries()) yield key
    }

    *values(): IterableIterator<V> {
        for (const [, value] of this.entries()) yield value
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.entries()
    }

    [collectionDebug](): CollectionDebugState {
        return { shellCount: this.shells.size, finalizationCount: this.finalized }
    }
}

