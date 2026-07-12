import { IdemWeakRef } from './idemWeakRef.js'
import { assertWeakTarget, collectionDebug } from './internal.js'
import type { CollectionDebugState } from './internal.js'

interface ValueShell<K, V extends object> {
    readonly key: K
    readonly ref: IdemWeakRef<V>
}

/** A Map with ordinary keys and weakly held object values. */
export class WeakValueMap<K, V extends object> implements Iterable<[K, V]> {
    private readonly entriesByKey = new Map<K, ValueShell<K, V>>()
    private readonly registry: FinalizationRegistry<ValueShell<K, V>>
    private finalized = 0

    constructor(entries?: Iterable<readonly [K, V]> | null) {
        this.registry = new FinalizationRegistry((shell) => {
            this.finalized++
            if (this.entriesByKey.get(shell.key) === shell) {
                this.entriesByKey.delete(shell.key)
            }
        })
        if (entries != null) {
            for (const [key, value] of entries) this.set(key, value)
        }
    }

    get(key: K): V | undefined {
        const shell = this.entriesByKey.get(key)
        if (shell === undefined) return undefined
        const value = shell.ref.deref()
        if (value !== undefined) return value

        this.removeShell(key, shell)
        return undefined
    }

    set(key: K, value: V): this {
        assertWeakTarget(value, 'WeakValueMap value')
        const previous = this.entriesByKey.get(key)
        if (previous !== undefined) this.registry.unregister(previous)

        const shell: ValueShell<K, V> = { key, ref: new IdemWeakRef(value) }
        this.entriesByKey.set(key, shell)
        this.registry.register(value, shell, shell)
        return this
    }

    has(key: K): boolean {
        const shell = this.entriesByKey.get(key)
        if (shell === undefined) return false
        if (shell.ref.deref() !== undefined) return true

        this.removeShell(key, shell)
        return false
    }

    delete(key: K): boolean {
        const shell = this.entriesByKey.get(key)
        if (shell === undefined) return false
        this.registry.unregister(shell)
        return this.entriesByKey.delete(key)
    }

    clear(): void {
        for (const shell of this.entriesByKey.values()) this.registry.unregister(shell)
        this.entriesByKey.clear()
    }

    /** Registered entries minus explicit removals and delivered finalizers. */
    get sizeApprox(): number {
        return this.entriesByKey.size
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        for (const [key, shell] of this.entriesByKey) {
            const value = shell.ref.deref()
            if (value !== undefined) {
                yield [key, value]
            } else {
                this.removeShell(key, shell)
            }
        }
    }

    [collectionDebug](): CollectionDebugState {
        return { shellCount: this.entriesByKey.size, finalizationCount: this.finalized }
    }

    private removeShell(key: K, shell: ValueShell<K, V>): void {
        if (this.entriesByKey.get(key) !== shell) return
        this.registry.unregister(shell)
        this.entriesByKey.delete(key)
    }
}

