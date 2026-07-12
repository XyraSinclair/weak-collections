import { describe, expect, it } from 'vitest'

import { IterableWeakMap } from './iterableWeakMap.js'
import { IterableWeakSet } from './iterableWeakSet.js'
import { debugState } from './testKit.js'
import { WeakValueMap } from './weakValueMap.js'

describe('IterableWeakSet contract', () => {
    it('adds by identity, chains, deletes, and constructs from an iterable', () => {
        const a = { id: 'a' }
        const b = { id: 'b' }
        const sameShape = { id: 'a' }
        const set = new IterableWeakSet([a, b, a])

        expect(set.sizeApprox).toBe(2)
        expect(set.has(a)).toBe(true)
        expect(set.has(sameShape)).toBe(false)
        expect(set.add(sameShape)).toBe(set)
        expect(set.delete(a)).toBe(true)
        expect(set.delete(a)).toBe(false)
        expect([...set]).toEqual([b, sameShape])
    })

    it('follows native Set iteration behavior under mutation', () => {
        const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
        const set = new IterableWeakSet([a, b, c])
        const iterator = set[Symbol.iterator]()

        expect(iterator.next().value).toBe(a)
        set.delete(b)
        set.add(d)
        expect([...iterator]).toEqual([c, d])
    })

    it('clear releases every shell immediately', () => {
        const values = [{}, {}, {}]
        const set = new IterableWeakSet(values)
        set.clear()
        expect(set.sizeApprox).toBe(0)
        expect([...set]).toEqual([])
        expect(values.every((value) => !set.has(value))).toBe(true)
    })

    it('rejects registered symbols with a clear weak-target error', () => {
        const set = new IterableWeakSet<object>()
        expect(() => set.add(Symbol.for('registered') as never)).toThrow(
            'IterableWeakSet member cannot be a registered symbol',
        )
    })

    it('rejects local symbols with an honest message (valid ES2023 targets, excluded by scope)', () => {
        const set = new IterableWeakSet<object>()
        expect(() => set.add(Symbol('local') as never)).toThrow(
            /valid weak targets in ES2023.*deliberately excludes/,
        )
    })
})

describe('IterableWeakMap contract', () => {
    it('implements get/set/has/delete, stored undefined, and constructors', () => {
        const a = {}
        const b = {}
        const map = new IterableWeakMap<object, number | undefined>([[a, 1]])

        expect(map.set(b, undefined)).toBe(map)
        expect(map.get(a)).toBe(1)
        expect(map.get(b)).toBeUndefined()
        expect(map.has(b)).toBe(true)
        expect(map.sizeApprox).toBe(2)
        expect(map.delete(a)).toBe(true)
        expect(map.delete(a)).toBe(false)
    })

    it('exposes live entries, keys, values, and the default iterator', () => {
        const a = {}
        const b = {}
        const map = new IterableWeakMap([[a, 'a'], [b, 'b']])
        expect([...map]).toEqual([[a, 'a'], [b, 'b']])
        expect([...map.entries()]).toEqual([[a, 'a'], [b, 'b']])
        expect([...map.keys()]).toEqual([a, b])
        expect([...map.values()]).toEqual(['a', 'b'])
    })

    it('follows native Map iteration behavior under mutation', () => {
        const [a, b, c, d] = Array.from({ length: 4 }, (_, id) => ({ id }))
        const map = new IterableWeakMap([[a, 'a'], [b, 'b'], [c, 'c']])
        const iterator = map.entries()

        expect(iterator.next().value).toEqual([a, 'a'])
        map.delete(b)
        map.set(c, 'updated')
        map.set(d, 'd')
        expect([...iterator]).toEqual([[c, 'updated'], [d, 'd']])
    })

    it('clear drops all keys and values', () => {
        const key = {}
        const map = new IterableWeakMap([[key, { payload: true }]])
        map.clear()
        expect(map.sizeApprox).toBe(0)
        expect(map.has(key)).toBe(false)
        expect([...map]).toEqual([])
    })

    it('rejects registered symbol keys', () => {
        const map = new IterableWeakMap<object, number>()
        expect(() => map.set(Symbol.for('registered') as never, 1)).toThrow(
            'IterableWeakMap key cannot be a registered symbol',
        )
    })
})

describe('WeakValueMap contract', () => {
    it('supports arbitrary SameValueZero keys and chainable set', () => {
        const a = {}
        const b = {}
        const registered = Symbol.for('registered-key')
        const map = new WeakValueMap<unknown, object>([[NaN, a]])

        expect(map.set(-0, b)).toBe(map)
        expect(map.get(NaN)).toBe(a)
        expect(map.get(0)).toBe(b)
        expect(map.has(-0)).toBe(true)
        expect(map.set(registered, a)).toBe(map)
        expect(map.get(registered)).toBe(a)
        expect(map.delete(NaN)).toBe(true)
        expect(map.delete(NaN)).toBe(false)
    })

    it('overwrites in place and follows native Map mutation order', () => {
        const [a, b, c, d] = Array.from({ length: 4 }, (_, id) => ({ id }))
        const replacement = { id: 22 }
        const map = new WeakValueMap([['a', a], ['b', b], ['c', c]])
        const iterator = map[Symbol.iterator]()

        expect(iterator.next().value).toEqual(['a', a])
        map.delete('b')
        map.set('c', replacement)
        map.set('d', d)
        expect([...iterator]).toEqual([['c', replacement], ['d', d]])
    })

    it('clear and delete remove the exact shell (old leak shape)', () => {
        const value = {}
        const map = new WeakValueMap([['key', value]])
        expect(map.delete('key')).toBe(true)
        expect(debugState(map).shellCount).toBe(0)

        map.set('key', value).set('second', {})
        map.clear()
        expect(map.sizeApprox).toBe(0)
        expect([...map]).toEqual([])
    })

    it('rejects registered symbol values while allowing symbol keys', () => {
        const map = new WeakValueMap<unknown, object>()
        expect(() => map.set('key', Symbol.for('registered') as never)).toThrow(
            'WeakValueMap value cannot be a registered symbol',
        )
    })
})

