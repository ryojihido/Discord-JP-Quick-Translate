import { AppError } from '../../shared/protocol'
export const TTL_MS = 30 * 24 * 60 * 60 * 1000
const STORE = 'translations'
export interface CacheEntry { readonly key: string; readonly translation: string; readonly timestamp: number; readonly provider: string }
export class TranslationCache {
  private db: IDBDatabase | null = null
  private opening: Promise<void> | null = null
  open(): Promise<void> {
    if (this.opening) return this.opening
    this.opening = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('djt-cache', 1)
      let blocked = false
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp')
      }
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return }
        this.db = request.result
        this.db.onversionchange = () => { this.db?.close(); this.db = null }
        resolve()
      }
      request.onerror = () => reject(new AppError('キャッシュを開けません。'))
      request.onblocked = () => { blocked = true; reject(new AppError('キャッシュが別の画面で使用中です。拡張機能を再読み込みしてください。')) }
    })
    return this.opening
  }
  private transaction(mode: IDBTransactionMode): IDBTransaction {
    if (!this.db) throw new AppError('キャッシュが準備されていません。')
    return this.db.transaction(STORE, mode)
  }
  private complete(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(new AppError('キャッシュの保存・読取りに失敗しました。'))
      tx.onerror = () => reject(new AppError('キャッシュの保存・読取りに失敗しました。'))
    })
  }
  async get(key: string): Promise<CacheEntry | null> {
    const tx = this.transaction('readwrite')
    const done = this.complete(tx)
    const request = tx.objectStore(STORE).get(key)
    let entry: CacheEntry | null = null
    request.onsuccess = () => {
      const stored = request.result as CacheEntry | undefined
      if (stored && stored.timestamp > Date.now() - TTL_MS) entry = stored
      else if (stored) tx.objectStore(STORE).delete(key)
    }
    await done
    return entry
  }
  async set(entry: CacheEntry): Promise<void> {
    const tx = this.transaction('readwrite')
    const done = this.complete(tx)
    tx.objectStore(STORE).put(entry)
    await done
  }
  async prune(): Promise<number> {
    const tx = this.transaction('readwrite')
    const done = this.complete(tx)
    const request = tx.objectStore(STORE).index('timestamp').openCursor(IDBKeyRange.upperBound(Date.now() - TTL_MS))
    let count = 0
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) { cursor.delete(); count++; cursor.continue() }
    }
    await done
    return count
  }
  async count(): Promise<number> {
    const tx = this.transaction('readonly')
    const done = this.complete(tx)
    const request = tx.objectStore(STORE).count()
    await done
    return request.result
  }
  async clear(): Promise<void> {
    const tx = this.transaction('readwrite')
    const done = this.complete(tx)
    tx.objectStore(STORE).clear()
    await done
  }
}
export async function buildCacheKey(text: string, targetLang: string, provider: string): Promise<string> {
  // Versioned namespace does not reuse legacy HTML-placeholder cache entries.
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['plain-v2', text, targetLang, provider])))
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
}
