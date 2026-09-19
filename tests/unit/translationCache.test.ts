import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { TranslationCache, buildCacheKey, TTL_MS } from '../../src/background/cache/translationCache'
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange) })
describe('real IndexedDB cache', () => {
  it('requires successful initialization instead of silently using memory', async () => {
    await expect(new TranslationCache().get('x')).rejects.toThrow('準備')
  })
  it('shares the same open operation and persists data across instances', async () => {
    const a = new TranslationCache()
    expect(a.open()).toBe(a.open())
    await a.open()
    const entry = { key: 'x', translation: '訳', provider: 'deepl', timestamp: Date.now() }
    await a.set(entry)
    const b = new TranslationCache()
    await b.open()
    expect(await b.get('x')).toEqual(entry)
    expect(await b.get('missing')).toBeNull()
  })
  it('deletes expired entries on read, including exactly at the TTL', async () => {
    const cache = new TranslationCache()
    await cache.open()
    await cache.set({ key: 'old', translation: '訳', provider: 'deepl', timestamp: Date.now() - TTL_MS })
    expect(await cache.get('old')).toBeNull()
    expect(await cache.count()).toBe(0)
  })
  it('prunes expired data and clears all remaining data', async () => {
    const cache = new TranslationCache()
    await cache.open()
    await cache.set({ key: 'old', translation: '訳', provider: 'deepl', timestamp: 1 })
    await cache.set({ key: 'new', translation: '訳', provider: 'deepl', timestamp: Date.now() })
    expect(await cache.prune()).toBe(1)
    expect(await cache.count()).toBe(1)
    await cache.clear()
    expect(await cache.get('new')).toBeNull()
  })
  it('waits for transaction commit and rejects abort', async () => {
    const cache = new TranslationCache()
    await cache.open()
    const db = (cache as any).db as IDBDatabase
    const original = db.transaction.bind(db)
    vi.spyOn(db, 'transaction').mockImplementation((...args: any[]) => {
      const tx = original(...args as [string, IDBTransactionMode])
      queueMicrotask(() => tx.abort())
      return tx
    })
    await expect(cache.set({ key: 'x', translation: 'x', timestamp: Date.now(), provider: 'deepl' })).rejects.toThrow('失敗')
  })
  it('uses provider, language and unambiguous input boundaries in keys', async () => {
    const keys = await Promise.all([['a|b','JA','deepl'], ['a','b|JA','deepl'], ['a|b','EN','deepl'], ['a|b','JA','google']].map(args => buildCacheKey(...args as [string,string,string])))
    expect(new Set(keys).size).toBe(4)
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/)
  })
})
