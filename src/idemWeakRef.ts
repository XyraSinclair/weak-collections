import { assertWeakTarget } from './internal.js'

/**
 * A WeakRef interned by target identity.
 *
 * Repeated construction for the same live target returns the same ref object.
 * The interning table is weak-keyed and the stored ref does not retain its
 * target, so interning does not extend the target's lifetime.
 */
export class IdemWeakRef<T extends object> extends WeakRef<T> {
    private static readonly refs = new WeakMap<object, IdemWeakRef<object>>()

    constructor(target: T) {
        assertWeakTarget(target, 'WeakRef target')
        const existing = IdemWeakRef.refs.get(target)
        if (existing !== undefined) return existing as IdemWeakRef<T>

        super(target)
        IdemWeakRef.refs.set(target, this as IdemWeakRef<object>)
    }
}

