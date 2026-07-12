import { expect } from 'vitest'

import { collectionDebug } from './internal.js'
import type { CollectionDebugState } from './internal.js'

export const gc = globalThis.gc

export function debugState(
    collection: { [collectionDebug](): CollectionDebugState },
): CollectionDebugState {
    return collection[collectionDebug]()
}

export async function gcUntil(
    predicate: () => boolean,
    attempts = 120,
): Promise<void> {
    expect(gc, 'tests must run in a fork with --expose-gc').toBeTypeOf('function')
    for (let attempt = 0; attempt < attempts; attempt++) {
        gc!()
        await new Promise<void>((resolve) => setImmediate(resolve))
        if (predicate()) return
    }
    expect(predicate(), 'GC/finalization condition was not reached').toBe(true)
}

export async function gcRounds(rounds = 12): Promise<void> {
    expect(gc, 'tests must run in a fork with --expose-gc').toBeTypeOf('function')
    for (let round = 0; round < rounds; round++) {
        gc!()
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
}

