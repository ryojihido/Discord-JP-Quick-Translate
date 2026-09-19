import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TranslationQueue } from '../../src/content/queue/translationQueue'
import { fakeChrome } from '../helpers/chrome'
let env: ReturnType<typeof fakeChrome>
beforeEach(() => { env = fakeChrome(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function item(id: string, text = 'Hello', isInViewport = true) { return { id, text, isInViewport, resolve: vi.fn(), reject: vi.fn() } }
describe('real translation queue', () => {
  it('batches requests and preserves response-id mapping', async () => {
    env.chrome.runtime.sendMessage.mockImplementation((m, cb) => cb({ ok: true, data: { results: [...m.items].reverse().map((i: any) => ({ id: i.id, translation: i.text + '訳', provider: 'deepl' })) } }))
    const q = new TranslationQueue(), a = item('a', 'a', false), b = item('b','b')
    q.enqueue(a); q.enqueue(b)
    await vi.advanceTimersByTimeAsync(250)
    expect(env.chrome.runtime.sendMessage.mock.calls[0][0].items.map((i: any) => i.id)).toEqual(['b','a'])
    expect(a.resolve).toHaveBeenCalledWith({ translation: 'a訳', provider: 'deepl' })
    expect(b.resolve).toHaveBeenCalledOnce()
  })
  it.each([undefined, { error: 'old protocol' }, { ok: false, error: '認証エラー' }, { ok: true, data: {} },
    { ok: true, data: { results: [] } }, { ok: true, data: { results: [{ id: 'wrong', translation: 'x', provider: 'deepl' }] } },
    { ok: true, data: { results: [{ id: 'a', translation: '', provider: 'deepl' }] } }])('rejects malformed/error responses and always settles: %j', async response => {
    env.chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb(response))
    const q = new TranslationQueue(), a = item('a')
    q.enqueue(a)
    await vi.advanceTimersByTimeAsync(250)
    expect(a.reject).toHaveBeenCalledOnce()
    expect(a.resolve).not.toHaveBeenCalled()
  })
  it('settles runtime failures, missing callbacks and synchronous exceptions', async () => {
    for (const mode of ['runtime', 'timeout', 'throw']) {
      env.chrome.runtime.lastError = mode === 'runtime' ? { message: 'test' } : undefined
      env.chrome.runtime.sendMessage.mockImplementation((_m, cb) => {
        if (mode === 'runtime') cb(undefined)
        if (mode === 'throw') throw new Error('context invalidated')
      })
      const q = new TranslationQueue(), a = item(mode)
      q.enqueue(a)
      await vi.advanceTimersByTimeAsync(26000)
      expect(a.reject).toHaveBeenCalledOnce()
    }
  })
  it('cancels unsent items and discards late responses', async () => {
    let callback: any
    env.chrome.runtime.sendMessage.mockImplementation((_m, cb) => { callback = cb })
    const q = new TranslationQueue(), a = item('a'), b = item('b')
    q.enqueue(a)
    await vi.advanceTimersByTimeAsync(250)
    q.enqueue(b); q.cancel()
    callback({ ok: true, data: { results: [{ id: 'a', translation: '訳', provider: 'deepl' }] } })
    await vi.advanceTimersByTimeAsync(300)
    expect(a.resolve).not.toHaveBeenCalled()
    expect(a.reject).toHaveBeenCalledOnce()
    expect(b.reject).toHaveBeenCalledOnce()
    expect(env.chrome.runtime.sendMessage).toHaveBeenCalledOnce()
  })
  it('bounds batches, text sizes and pending work', async () => {
    const q = new TranslationQueue(), invalid = item('x', 'x'.repeat(8001))
    q.enqueue(invalid)
    expect(invalid.reject).toHaveBeenCalledOnce()
    const items = Array.from({ length: 101 }, (_, i) => item(String(i), 'x'.repeat(1000)))
    items.forEach(i => q.enqueue(i))
    expect(items[100].reject).toHaveBeenCalledOnce()
    env.chrome.runtime.sendMessage.mockImplementation((m, cb) => cb({ ok: true, data: { results: m.items.map((i: any) => ({ ...i, translation: '訳', provider: 'google' })) } }))
    await vi.advanceTimersByTimeAsync(3000)
    expect(env.chrome.runtime.sendMessage.mock.calls.every(([m]) => m.items.length <= 16)).toBe(true)
    expect(items[99].resolve).toHaveBeenCalledOnce()
  })
})
