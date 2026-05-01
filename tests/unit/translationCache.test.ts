import { describe, expect, it, beforeEach, vi } from 'vitest'

const TTL_MS = 30 * 24 * 60 * 60 * 1000

interface CacheEntry {
  key: string
  translation: string
  timestamp: number
  provider: string
}

class InMemoryTranslationCache {
  private store = new Map<string, CacheEntry>()

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.store.delete(key)
      return null
    }
    return entry
  }

  async set(entry: CacheEntry): Promise<void> {
    this.store.set(entry.key, { ...entry })
  }

  async prune(): Promise<number> {
    const cutoff = Date.now() - TTL_MS
    let count = 0
    for (const [key, entry] of this.store.entries()) {
      if (entry.timestamp < cutoff) {
        this.store.delete(key)
        count++
      }
    }
    return count
  }

  async count(): Promise<number> {
    return this.store.size
  }

  async clear(): Promise<void> {
    this.store.clear()
  }
}

describe('TranslationCache', () => {
  let cache: InMemoryTranslationCache

  beforeEach(() => {
    cache = new InMemoryTranslationCache()
    vi.useRealTimers()
  })

  it('returns null for a cache miss', async () => {
    // Arrange
    const key = 'nonexistent-key'

    // Act
    const result = await cache.get(key)

    // Assert
    expect(result).toBeNull()
  })

  it('returns the stored entry after set', async () => {
    // Arrange
    const entry: CacheEntry = {
      key: 'abc123',
      translation: 'こんにちは',
      timestamp: Date.now(),
      provider: 'deepl',
    }

    // Act
    await cache.set(entry)
    const result = await cache.get('abc123')

    // Assert
    expect(result).not.toBeNull()
    expect(result?.translation).toBe('こんにちは')
    expect(result?.provider).toBe('deepl')
  })

  it('returns null for an entry past the TTL', async () => {
    // Arrange
    vi.useFakeTimers()
    const entry: CacheEntry = {
      key: 'old-entry',
      translation: '古いテキスト',
      timestamp: Date.now(),
      provider: 'google',
    }
    await cache.set(entry)

    // Act: advance time beyond TTL
    vi.advanceTimersByTime(TTL_MS + 1000)
    const result = await cache.get('old-entry')

    // Assert
    expect(result).toBeNull()
  })

  it('prune removes expired entries and returns the count removed', async () => {
    // Arrange
    vi.useFakeTimers()
    const now = Date.now()

    const fresh: CacheEntry = {
      key: 'fresh',
      translation: '新鮮',
      timestamp: now,
      provider: 'deepl',
    }
    const stale: CacheEntry = {
      key: 'stale',
      translation: '古い',
      timestamp: now - TTL_MS - 1,
      provider: 'google',
    }

    await cache.set(fresh)
    await cache.set(stale)

    // Act
    const removed = await cache.prune()

    // Assert
    expect(removed).toBe(1)
    expect(await cache.count()).toBe(1)
    expect(await cache.get('fresh')).not.toBeNull()
    expect(await cache.get('stale')).toBeNull()
  })

  it('prune returns 0 when no entries are expired', async () => {
    // Arrange
    await cache.set({ key: 'k1', translation: 'a', timestamp: Date.now(), provider: 'deepl' })
    await cache.set({ key: 'k2', translation: 'b', timestamp: Date.now(), provider: 'deepl' })

    // Act
    const removed = await cache.prune()

    // Assert
    expect(removed).toBe(0)
    expect(await cache.count()).toBe(2)
  })

  it('clear removes all entries', async () => {
    // Arrange
    await cache.set({ key: 'k1', translation: 'a', timestamp: Date.now(), provider: 'deepl' })
    await cache.set({ key: 'k2', translation: 'b', timestamp: Date.now(), provider: 'deepl' })

    // Act
    await cache.clear()

    // Assert
    expect(await cache.count()).toBe(0)
    expect(await cache.get('k1')).toBeNull()
  })

  it('overwriting an entry with set updates the stored value', async () => {
    // Arrange
    const key = 'shared-key'
    await cache.set({ key, translation: '最初', timestamp: Date.now(), provider: 'deepl' })

    // Act
    await cache.set({ key, translation: '更新済み', timestamp: Date.now(), provider: 'google' })
    const result = await cache.get(key)

    // Assert
    expect(result?.translation).toBe('更新済み')
    expect(result?.provider).toBe('google')
  })
})
