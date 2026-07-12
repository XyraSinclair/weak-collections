/* Opt-in receipts: `npm run bench`.
 * Targets stay strongly reachable for the duration of each race so this is
 * operation overhead, not a contest over when V8 happens to collect them.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, loadavg, platform, arch } from 'node:os'

import IncumbentWeakValueMap from 'weak-value-map'
import { IterableWeakMap as IncumbentIterableWeakMap } from 'iterable-weak-map'
import { IterableWeakSet as IncumbentIterableWeakSet } from 'iterable-weak-set'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IterableWeakMap } from './iterableWeakMap.js'
import { IterableWeakSet } from './iterableWeakSet.js'
import { WeakValueMap } from './weakValueMap.js'

const N = 500
const objects = Array.from({ length: N }, (_, id) => ({ id }))
type Compare = typeof import('cyclebench').compare
type Report = Awaited<ReturnType<Compare>>

describe.skipIf(!process.env.BENCH)('cyclebench operation receipts', () => {
    let compare: Compare
    const reports: Record<string, unknown> = {}

    beforeAll(async () => {
        ;({ compare } = await import('cyclebench'))
    })

    afterAll(() => {
        mkdirSync('receipts', { recursive: true })
        writeFileSync('receipts/throughput.json', `${JSON.stringify({
            generatedAt: new Date().toISOString(),
            runtime: process.version,
            v8: process.versions.v8,
            machine: `${platform()}-${arch()} ${cpus()[0]?.model ?? 'unknown CPU'}`,
            loadAverage: loadavg(),
            operationsPerCall: N,
            reports,
        }, null, 2)}\n`)
    })

    const race = async (
        label: string,
        candidates: Record<string, () => unknown>,
    ): Promise<Report> => {
        const report = await compare({
            candidates,
            agree: 'deep',
            timeMs: 300,
            warmupMs: 80,
        })
        expect(report.ok).toBe(true)
        reports[label] = report
        // eslint-disable-next-line no-console
        console.info(`\n${label} (${N} operations/call)`)
        report.print()
        return report
    }

    it('set add', async () => {
        await race('set add', {
            'weak-collections': () => {
                const set = new IterableWeakSet<object>()
                for (const object of objects) set.add(object)
                return set.has(objects[N - 1])
            },
            'iterable-weak-set': () => {
                const set = new IncumbentIterableWeakSet<object>()
                for (const object of objects) set.add(object)
                return set.has(objects[N - 1])
            },
            'native WeakSet': () => {
                const set = new WeakSet<object>()
                for (const object of objects) set.add(object)
                return set.has(objects[N - 1])
            },
        })
    })

    it('set has', async () => {
        const ours = new IterableWeakSet(objects)
        const incumbent = new IncumbentIterableWeakSet<object>()
        const native = new WeakSet(objects)
        for (const object of objects) incumbent.add(object)
        await race('set has', {
            'weak-collections': () => {
                let hits = 0
                for (const object of objects) if (ours.has(object)) hits++
                return hits
            },
            'iterable-weak-set': () => {
                let hits = 0
                for (const object of objects) if (incumbent.has(object)) hits++
                return hits
            },
            'native WeakSet': () => {
                let hits = 0
                for (const object of objects) if (native.has(object)) hits++
                return hits
            },
        })
    })

    it('set iteration', async () => {
        const ours = new IterableWeakSet(objects)
        const incumbent = new IncumbentIterableWeakSet<object>()
        const strong = new Set(objects)
        for (const object of objects) incumbent.add(object)
        await race('set iteration', {
            'weak-collections': () => {
                let sum = 0
                for (const object of ours) sum += object.id
                return sum
            },
            'iterable-weak-set': () => {
                let sum = 0
                for (const object of incumbent) sum += object.id
                return sum
            },
            'native Set': () => {
                let sum = 0
                for (const object of strong) sum += object.id
                return sum
            },
        })
    })

    it('map set', async () => {
        await race('map set', {
            'weak-collections': () => {
                const map = new IterableWeakMap<object, number>()
                for (const object of objects) map.set(object, object.id)
                return map.get(objects[N - 1])
            },
            'iterable-weak-map': () => {
                const map = new IncumbentIterableWeakMap<object, number>()
                for (const object of objects) map.set(object, object.id)
                return map.get(objects[N - 1])
            },
            'native WeakMap': () => {
                const map = new WeakMap<object, number>()
                for (const object of objects) map.set(object, object.id)
                return map.get(objects[N - 1])
            },
        })
    })

    it('map get', async () => {
        const ours = new IterableWeakMap<object, number>()
        const incumbent = new IncumbentIterableWeakMap<object, number>()
        const native = new WeakMap<object, number>()
        for (const object of objects) {
            ours.set(object, object.id)
            incumbent.set(object, object.id)
            native.set(object, object.id)
        }
        await race('map get', {
            'weak-collections': () => {
                let sum = 0
                for (const object of objects) sum += ours.get(object)!
                return sum
            },
            'iterable-weak-map': () => {
                let sum = 0
                for (const object of objects) sum += incumbent.get(object)!
                return sum
            },
            'native WeakMap': () => {
                let sum = 0
                for (const object of objects) sum += native.get(object)!
                return sum
            },
        })
    })

    it('map iteration', async () => {
        const ours = new IterableWeakMap<object, number>()
        const incumbent = new IncumbentIterableWeakMap<object, number>()
        const strong = new Map<object, number>()
        for (const object of objects) {
            ours.set(object, object.id)
            incumbent.set(object, object.id)
            strong.set(object, object.id)
        }
        await race('map iteration', {
            'weak-collections': () => {
                let sum = 0
                for (const [, value] of ours) sum += value
                return sum
            },
            'iterable-weak-map': () => {
                let sum = 0
                for (const [, value] of incumbent) sum += value
                return sum
            },
            'native Map': () => {
                let sum = 0
                for (const [, value] of strong) sum += value
                return sum
            },
        })
    })

    it('weak-value set and get', async () => {
        await race('weak-value set', {
            'weak-collections': () => {
                const map = new WeakValueMap<number, object>()
                for (const object of objects) map.set(object.id, object)
                return map.get(N - 1) === objects[N - 1]
            },
            'weak-value-map': () => {
                const map = new IncumbentWeakValueMap<number, object>()
                for (const object of objects) map.set(object.id, object)
                return map.get(N - 1) === objects[N - 1]
            },
            'native Map': () => {
                const map = new Map<number, object>()
                for (const object of objects) map.set(object.id, object)
                return map.get(N - 1) === objects[N - 1]
            },
        })

        const ours = new WeakValueMap<number, { id: number }>(
            objects.map((object) => [object.id, object]),
        )
        const incumbent = new IncumbentWeakValueMap<number, { id: number }>()
        const strong = new Map<number, { id: number }>()
        for (const object of objects) {
            incumbent.set(object.id, object)
            strong.set(object.id, object)
        }
        await race('weak-value get', {
            'weak-collections': () => {
                let sum = 0
                for (let id = 0; id < N; id++) sum += ours.get(id)!.id
                return sum
            },
            'weak-value-map': () => {
                let sum = 0
                for (let id = 0; id < N; id++) sum += incumbent.get(id)!.id
                return sum
            },
            'native Map': () => {
                let sum = 0
                for (let id = 0; id < N; id++) sum += strong.get(id)!.id
                return sum
            },
        })
    })

    it('weak-value iteration', async () => {
        const ours = new WeakValueMap<number, { id: number }>(
            objects.map((object) => [object.id, object]),
        )
        const strong = new Map(objects.map((object) => [object.id, object]))
        await race('weak-value iteration', {
            'weak-collections': () => {
                let sum = 0
                for (const [, value] of ours) sum += value.id
                return sum
            },
            'native Map': () => {
                let sum = 0
                for (const [, value] of strong) sum += value.id
                return sum
            },
        })
    })
})
