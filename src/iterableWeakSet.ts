import { IdemWeakRef } from './idemWeakRef.js'
import { assertWeakTarget, collectionDebug } from './internal.js'
import type { CollectionDebugState } from './internal.js'

interface SetShell<T extends object> {
    readonly ref: IdemWeakRef<T>
}

/** An enumerable Set whose members do not stay alive merely because they are members. */
export class IterableWeakSet<T extends object> implements Iterable<T> {
    private lookup = new WeakMap<T, SetShell<T>>()
    private readonly shells = new Set<SetShell<T>>()
    private readonly registry: FinalizationRegistry<SetShell<T>>
    private finalized = 0

    constructor(values?: Iterable<T> | null) {
        this.registry = new FinalizationRegistry((shell) => {
            this.finalized++
            this.shells.delete(shell)
        })
        if (values != null) {
            for (const value of values) this.add(value)
        }
    }

    add(value: T): this {
        assertWeakTarget(value, 'IterableWeakSet member')
        if (this.lookup.has(value)) return this

        const shell: SetShell<T> = { ref: new IdemWeakRef(value) }
        this.lookup.set(value, shell)
        this.shells.add(shell)
        this.registry.register(value, shell, shell)
        return this
    }

    has(value: T): boolean {
        assertWeakTarget(value, 'IterableWeakSet member')
        return this.lookup.has(value)
    }

    delete(value: T): boolean {
        assertWeakTarget(value, 'IterableWeakSet member')
        // Read the shell before deleting the weak lookup. Reversing these two
        // operations is the historical shell-leak regression this package pins.
        const shell = this.lookup.get(value)
        if (shell === undefined) return false

        this.lookup.delete(value)
        this.registry.unregister(shell)
        this.shells.delete(shell)
        return true
    }

    clear(): void {
        for (const shell of this.shells) this.registry.unregister(shell)
        this.shells.clear()
        this.lookup = new WeakMap()
    }

    /** Registered entries minus explicit removals and delivered finalizers. */
    get sizeApprox(): number {
        return this.shells.size
    }

    *[Symbol.iterator](): IterableIterator<T> {
        for (const shell of this.shells) {
            // Exactly one dereference per step keeps the member alive for the
            // duration of this iteration step and avoids a GC race.
            const value = shell.ref.deref()
            if (value !== undefined) {
                yield value
            } else {
                this.registry.unregister(shell)
                this.shells.delete(shell)
            }
        }
    }

    [collectionDebug](): CollectionDebugState {
        return { shellCount: this.shells.size, finalizationCount: this.finalized }
    }
}

