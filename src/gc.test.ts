import { describe, expect, it } from 'vitest'

import { IdemWeakRef } from './idemWeakRef.js'
import { IterableWeakMap } from './iterableWeakMap.js'
import { IterableWeakSet } from './iterableWeakSet.js'
import { debugState, gcRounds, gcUntil } from './testKit.js'
import { WeakValueMap } from './weakValueMap.js'

const CHURN = 10_000
const LIVE = 8

function churnSet(set: IterableWeakSet<{ id: number }>): Array<{ id: number }> {
    const live: Array<{ id: number }> = []
    for (let id = 0; id < CHURN; id++) {
        const value = { id }
        set.add(value)
        if (id < LIVE) live.push(value)
    }
    return live
}

function churnMap(map: IterableWeakMap<{ id: number }, object>): Array<{ id: number }> {
    const live: Array<{ id: number }> = []
    for (let id = 0; id < CHURN; id++) {
        const key = { id }
        map.set(key, { id })
        if (id < LIVE) live.push(key)
    }
    return live
}

function churnValues(map: WeakValueMap<number, { id: number }>): Array<{ id: number }> {
    const live: Array<{ id: number }> = []
    for (let id = 0; id < CHURN; id++) {
        const value = { id }
        map.set(id, value)
        if (id < LIVE) live.push(value)
    }
    return live
}

describe('GC receipts and shell freedom', () => {
    it('IterableWeakSet prunes all dead member shells after 10k churn', async () => {
        const set = new IterableWeakSet<{ id: number }>()
        const live = churnSet(set)
        await gcUntil(() => debugState(set).shellCount === live.length)

        expect(debugState(set)).toEqual({
            shellCount: live.length,
            finalizationCount: CHURN - live.length,
        })
        expect([...set].map(({ id }) => id)).toEqual(live.map(({ id }) => id))
    })

    it('IterableWeakMap prunes shells and values, including key/value cycles', async () => {
        const map = new IterableWeakMap<{ id: number }, object>()
        const live = churnMap(map)
        await gcUntil(() => debugState(map).shellCount === live.length)
        expect([...map].map(([key]) => key.id)).toEqual(live.map(({ id }) => id))

        const cycleMap = new IterableWeakMap<object, object>()
        let receipt = 0
        const receiptRegistry = new FinalizationRegistry(() => receipt++)
        ;(() => {
            const key: { value?: object } = {}
            const value = { key }
            key.value = value
            receiptRegistry.register(key, 'key')
            cycleMap.set(key, value)
        })()
        await gcUntil(() => receipt === 1 && debugState(cycleMap).shellCount === 0)

        expect([...cycleMap]).toEqual([])
    })

    it('WeakValueMap prunes every dead value shell after 10k churn', async () => {
        const map = new WeakValueMap<number, { id: number }>()
        const live = churnValues(map)
        await gcUntil(() => debugState(map).shellCount === live.length)

        expect(debugState(map)).toEqual({
            shellCount: live.length,
            finalizationCount: CHURN - live.length,
        })
        expect([...map].map(([key]) => key)).toEqual(live.map(({ id }) => id))
    })

    it('delete never leaks the exact shell for any collection', () => {
        const member = {}
        const key = {}
        const value = {}
        const set = new IterableWeakSet([member])
        const map = new IterableWeakMap([[key, 'value']])
        const values = new WeakValueMap([['key', value]])

        expect(set.delete(member)).toBe(true)
        expect(map.delete(key)).toBe(true)
        expect(values.delete('key')).toBe(true)
        expect(debugState(set).shellCount).toBe(0)
        expect(debugState(map).shellCount).toBe(0)
        expect(debugState(values).shellCount).toBe(0)
    })

    it('clear unregisters every canary so no callback fires afterward', async () => {
        const set = new IterableWeakSet<object>()
        const map = new IterableWeakMap<object, object>()
        const values = new WeakValueMap<string, object>()
        ;(() => {
            const member = {}
            const key = {}
            const value = {}
            set.add(member)
            map.set(key, {})
            values.set('value', value)
            set.clear()
            map.clear()
            values.clear()
        })()

        await gcRounds()
        expect(debugState(set)).toEqual({ shellCount: 0, finalizationCount: 0 })
        expect(debugState(map)).toEqual({ shellCount: 0, finalizationCount: 0 })
        expect(debugState(values)).toEqual({ shellCount: 0, finalizationCount: 0 })
    })
})

describe('IdemWeakRef', () => {
    it('returns the same ref object for the same live target', () => {
        const target = {}
        expect(new IdemWeakRef(target)).toBe(new IdemWeakRef(target))
    })

    it('does not retain its interned target and a later target gets a new ref', async () => {
        let receipt = 0
        const registry = new FinalizationRegistry(() => receipt++)
        let ref: IdemWeakRef<{ id: number }> | undefined
        ;(() => {
            const target = { id: 1 }
            registry.register(target, 'target')
            ref = new IdemWeakRef(target)
        })()

        await gcUntil(() => receipt === 1)
        expect(ref!.deref()).toBeUndefined()

        const next = { id: 1 }
        const nextRef = new IdemWeakRef(next)
        expect(nextRef).not.toBe(ref)
        expect(nextRef.deref()).toBe(next)
    })
})

