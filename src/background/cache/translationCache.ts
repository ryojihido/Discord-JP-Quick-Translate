const DB_NAME = 'djt-cache'
const DB_VERSION = 1
const STORE_NAME = 'translations'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface CacheEntry {
  readonly key: string
  readonly translation: string
  readonly timestamp: number
  readonly provider: string
}

export class TranslationCache {
  private db: IDBDatabase | null = null
  private readonly memoryCache = new Map<string, CacheEntry>()

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp')
        }
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  }

  async get(key: string): Promise<CacheEntry | null> {
    const memHit = this.memoryCache.get(key)
    if (memHit) {
      if (Date.now() - memHit.timestamp > TTL_MS) {
        this.memoryCache.delete(key)
        return null
      }
      return memHit
    }

    if (!this.db) return null

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined
        if (!entry) {
          resolve(null)
          return
        }

        if (Date.now() - entry.timestamp > TTL_MS) {
          resolve(null)
          return
        }

        this.memoryCache.set(key, entry)
        resolve(entry)
      }

      request.onerror = () => reject(request.error)
    })
  }

  async set(entry: CacheEntry): Promise<void> {
    this.memoryCache.set(entry.key, entry)

    if (!this.db) return

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(entry)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async prune(): Promise<number> {
    const cutoff = Date.now() - TTL_MS

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < cutoff) {
        this.memoryCache.delete(key)
      }
    }

    if (!this.db) return 0

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      let count = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) {
          resolve(count)
          return
        }
        cursor.delete()
        count++
        cursor.continue()
      }

      request.onerror = () => reject(request.error)
    })
  }

  async count(): Promise<number> {
    if (!this.db) return this.memoryCache.size

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(): Promise<void> {
    this.memoryCache.clear()

    if (!this.db) return

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export async function buildCacheKey(
  text: string,
  targetLang: string,
  provider: string,
): Promise<string> {
  const raw = `${text}|${targetLang}|${provider}`
  const encoded = new TextEncoder().encode(raw)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
