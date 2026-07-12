import { describe, expect, it } from 'vitest'

import { IterableWeakMap } from './iterableWeakMap.js'
import { IterableWeakSet } from './iterableWeakSet.js'
import { debugState, gcUntil } from './testKit.js'
import { WeakValueMap } from './weakValueMap.js'

let seed = 0x51_17_2026
const random = (): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed / 2 ** 32
}

describe('model-based GC fuzz', () => {
    it('matches strong live-view models through random add/delete/death rounds', async () => {
        const count = 80
        const setObjects = new Map(
            Array.from({ length: count }, (_, id) => [id, { id }]),
        )
        const mapObjects = new Map(
            Array.from({ length: count }, (_, id) => [id, { id }]),
        )
        const valueObjects = new Map(
            Array.from({ length: count }, (_, id) => [id, { id }]),
        )

        const set = new IterableWeakSet<{ id: number }>()
        const map = new IterableWeakMap<{ id: number }, number>()
        const values = new WeakValueMap<number, { id: number }>()
        const setModel = new Set<number>()
        const mapModel = new Set<number>()
        const valueModel = new Set<number>()

        for (let round = 0; round < 20; round++) {
            for (let operation = 0; operation < 30; operation++) {
                const id = Math.floor(random() * count)
                const action = Math.floor(random() * 3)

                if (action === 0) {
                    const setObject = setObjects.get(id)
                    if (setObject !== undefined) {
                        set.add(setObject)
                        setModel.add(id)
                    }
                    const mapObject = mapObjects.get(id)
                    if (mapObject !== undefined) {
                        map.set(mapObject, id * 2)
                        mapModel.add(id)
                    }
                    const valueObject = valueObjects.get(id)
                    if (valueObject !== undefined) {
                        values.set(id, valueObject)
                        valueModel.add(id)
                    }
                } else if (action === 1) {
                    const setObject = setObjects.get(id)
                    if (setObject !== undefined) set.delete(setObject)
                    setModel.delete(id)
                    const mapObject = mapObjects.get(id)
                    if (mapObject !== undefined) map.delete(mapObject)
                    mapModel.delete(id)
                    values.delete(id)
                    valueModel.delete(id)
                } else {
                    setObjects.delete(id)
                    mapObjects.delete(id)
                    valueObjects.delete(id)
                    setModel.delete(id)
                    mapModel.delete(id)
                    valueModel.delete(id)
                }
            }

            await gcUntil(
                () => debugState(set).shellCount === setModel.size
                    && debugState(map).shellCount === mapModel.size
                    && debugState(values).shellCount === valueModel.size,
            )

            expect([...set].map(({ id }) => id).sort((a, b) => a - b))
                .toEqual([...setModel].sort((a, b) => a - b))
            expect([...map].map(([key]) => key.id).sort((a, b) => a - b))
                .toEqual([...mapModel].sort((a, b) => a - b))
            expect([...map].every(([key, value]) => value === key.id * 2)).toBe(true)
            expect([...values].map(([key]) => key).sort((a, b) => a - b))
                .toEqual([...valueModel].sort((a, b) => a - b))
        }
    })
})

