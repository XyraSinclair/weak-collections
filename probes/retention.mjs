import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { arch, cpus, loadavg, platform } from 'node:os'

import estimateMemory from 'heap-estimate'
import { IterableWeakMap as IncumbentIterableWeakMap } from 'iterable-weak-map'
import IncumbentWeakValueMap from 'weak-value-map'

import { IterableWeakMap, IterableWeakSet, WeakValueMap } from '../dist/index.js'
import { collectionDebug } from '../dist/internal.js'

const N = 20_000
const candidate = process.argv[2] === '--case' ? process.argv[3] : undefined

if (typeof globalThis.gc !== 'function') {
    console.error('run with --expose-gc (npm run probe)')
    process.exit(1)
}

const settle = async (done = () => false, attempts = 12) => {
    for (let round = 0; round < attempts; round++) {
        globalThis.gc()
        await new Promise((resolve) => setImmediate(resolve))
        if (done()) return
    }
}

const construct = (name) => {
    switch (name) {
        case 'IterableWeakSet': return new IterableWeakSet()
        case 'IterableWeakMap': return new IterableWeakMap()
        case 'iterable-weak-map': return new IncumbentIterableWeakMap()
        case 'WeakValueMap': return new WeakValueMap()
        case 'weak-value-map': return new IncumbentWeakValueMap()
        default: throw new Error(`unknown candidate: ${name}`)
    }
}

const fill = (name, collection, receipts) => {
    if (name === 'IterableWeakSet') {
        for (let id = 0; id < N; id++) {
            const target = { id, payload: new Array(16).fill(id) }
            receipts.register(target, id)
            collection.add(target)
        }
        return
    }
    if (name === 'IterableWeakMap' || name === 'iterable-weak-map') {
        for (let id = 0; id < N; id++) {
            const target = { id }
            receipts.register(target, id)
            collection.set(target, { payload: new Array(16).fill(id) })
        }
        return
    }
    for (let id = 0; id < N; id++) {
        const target = { id, payload: new Array(16).fill(id) }
        receipts.register(target, id)
        collection.set(id, target)
    }
}

const shellCount = (name, collection) => {
    if (name === 'IterableWeakSet' || name === 'IterableWeakMap' || name === 'WeakValueMap') {
        return collection[collectionDebug]().shellCount
    }
    if (name === 'iterable-weak-map') return collection.keysSet.__set.size
    return null // native add-on internals are intentionally opaque
}

const runCase = async (name) => {
    const collection = construct(name)
    // Warm the relevant code and collection shape before taking the baseline.
    if (name === 'IterableWeakSet') {
        const warm = {}
        collection.add(warm)
        collection.delete(warm)
    } else {
        const warmKey = name.includes('Value') || name === 'weak-value-map' ? 0 : {}
        const warmValue = {}
        collection.set(warmKey, warmValue)
        collection.delete(warmKey)
    }
    await settle()
    const before = process.memoryUsage().heapUsed
    let finalized = 0
    const receipts = new FinalizationRegistry(() => finalized++)
    fill(name, collection, receipts)
    await settle(() => finalized === N, 120)
    if (name === 'IterableWeakSet' || name === 'IterableWeakMap' || name === 'WeakValueMap') {
        // The observer registry and the collection registry are scheduled
        // independently. Do not sample merely because the observer won the race.
        await settle(() => shellCount(name, collection) === 0, 120)
    } else {
        await settle()
    }
    const after = process.memoryUsage().heapUsed
    return {
        candidate: name,
        finalized,
        shellCount: shellCount(name, collection),
        heapEstimateBytes: estimateMemory(collection),
        processHeapDeltaBytes: after - before,
    }
}

if (candidate !== undefined) {
    process.stdout.write(JSON.stringify(await runCase(candidate)))
} else {
    const names = [
        'IterableWeakSet',
        'IterableWeakMap',
        'iterable-weak-map',
        'WeakValueMap',
        'weak-value-map',
    ]
    const repetitions = 5
    const raw = Object.fromEntries(names.map((name) => [name, []]))
    for (const name of names) {
        for (let repetition = 0; repetition < repetitions; repetition++) {
            const output = execFileSync(process.execPath, ['--expose-gc', import.meta.filename, '--case', name], {
                encoding: 'utf8',
            })
            raw[name].push(JSON.parse(output))
        }
    }

    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const results = names.map((name) => ({
        candidate: name,
        finalized: median(raw[name].map((result) => result.finalized)),
        shellCount: raw[name][0].shellCount === null
            ? null
            : median(raw[name].map((result) => result.shellCount)),
        heapEstimateBytes: median(raw[name].map((result) => result.heapEstimateBytes)),
        processHeapDeltaBytes: median(raw[name].map((result) => result.processHeapDeltaBytes)),
    }))
    const receipt = {
        generatedAt: new Date().toISOString(),
        runtime: process.version,
        v8: process.versions.v8,
        machine: `${platform()}-${arch()} ${cpus()[0]?.model ?? 'unknown CPU'}`,
        loadAverage: loadavg(),
        deadMembers: N,
        repetitions,
        results,
        raw,
    }
    mkdirSync('receipts', { recursive: true })
    writeFileSync('receipts/retention.json', `${JSON.stringify(receipt, null, 2)}\n`)

    const mib = (bytes) => `${(bytes / 1_048_576).toFixed(2)} MiB`
    console.log(`\n${N.toLocaleString()} dropped targets; median of ${repetitions} isolated runs`)
    console.log('candidate'.padEnd(22), 'collected'.padStart(12), 'shells'.padStart(9), 'heap-est'.padStart(11), 'heap delta'.padStart(11))
    for (const result of results) {
        console.log(
            result.candidate.padEnd(22),
            `${result.finalized}/${N}`.padStart(12),
            String(result.shellCount ?? 'opaque').padStart(9),
            mib(result.heapEstimateBytes).padStart(11),
            mib(result.processHeapDeltaBytes).padStart(11),
        )
    }
    console.log(`load average at receipt write: ${loadavg().map((value) => value.toFixed(2)).join(', ')}`)
}
