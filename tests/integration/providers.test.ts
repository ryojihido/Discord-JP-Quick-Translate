import { afterEach, describe, expect, it, vi } from 'vitest'
import { translateWithDeepL } from '../../src/background/api/deeplProvider'
import { translateWithGoogle } from '../../src/background/api/googleProvider'
import { routeTranslation } from '../../src/background/api/providerRouter'
import { API_TIMEOUT_MS } from '../../src/background/api/http'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('provider HTTP boundaries (isolated, no external requests)', () => {
  it('sends DeepL plain text with header authentication, no HTML interpretation', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ translations: [{ text: '訳' }] })))
    vi.stubGlobal('fetch', fetch)
    expect(await translateWithDeepL({ texts: ['<x>& hello'], targetLang: 'ja', apiKey: 'dummy-key' })).toEqual(['訳'])
    const [url, init] = fetch.mock.calls[0] as any
    expect(url).toBe('https://api-free.deepl.com/v2/translate')
    expect(init.headers.Authorization).toBe('DeepL-Auth-Key dummy-key')
    expect(JSON.parse(init.body)).toEqual({ text: ['<x>& hello'], target_lang: 'JA' })
    expect(init.redirect).toBe('error')
  })
  it('keeps Google keys out of the URL and uses plain-text format', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { translations: [{ translatedText: '<訳>' }] } })))
    vi.stubGlobal('fetch', fetch)
    expect(await translateWithGoogle({ texts: ['hello'], targetLang: 'JA', apiKey: 'dummy-key' })).toEqual(['<訳>'])
    const [url, init] = fetch.mock.calls[0] as any
    expect(url).not.toContain('?')
    expect(init.headers['x-goog-api-key']).toBe('dummy-key')
    expect(JSON.parse(init.body).format).toBe('text')
  })
  it.each([401,403,429,456,500])('fails explicitly on HTTP %i without contacting another provider', async status => {
    const fetch = vi.fn(async () => new Response('', { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(routeTranslation(['hi'], 'JA', 'deepl', 'dummy', 'dummy')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toContain('deepl')
  })
  it('never substitutes another provider when the selected key is missing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(routeTranslation(['hi'], 'JA', 'deepl', null, 'dummy')).rejects.toThrow('キー')
    await expect(routeTranslation(['hi'], 'JA', 'bad' as any, 'dummy', 'dummy')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{}, { translations: [] }, { translations: [{ text: '' }] }, { translations: [{ text: 1 }] }])('rejects malformed DeepL response %j', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))
    await expect(translateWithDeepL({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy' })).rejects.toThrow('形式')
  })
  it.each([{}, { data: {} }, { data: { translations: [] } }, { data: { translations: [{ translatedText: '' }] } }])('rejects malformed Google response %j', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))
    await expect(translateWithGoogle({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy' })).rejects.toThrow('形式')
  })
  it('validates oversized requests before HTTP and handles empty requests', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    for (const translate of [translateWithDeepL, translateWithGoogle]) {
      expect(await translate({ texts: [], targetLang: 'JA', apiKey: 'dummy' })).toEqual([])
      await expect(translate({ texts: ['x'.repeat(8001)], targetLang: 'JA', apiKey: 'dummy' })).rejects.toThrow()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('aborts timed-out and externally-cancelled requests', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted','AbortError')))
    })))
    const request = translateWithDeepL({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy' })
    const assertion = expect(request).rejects.toThrow('タイムアウト')
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS)
    await assertion
    const controller = new AbortController()
    const next = translateWithGoogle({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy', signal: controller.signal })
    controller.abort()
    await expect(next).rejects.toThrow('中止')
  })
  it('does not expose provider error bodies or fetch errors containing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('secret-value') }))
    await expect(translateWithDeepL({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy' })).rejects.toThrow('通信')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json secret-value')))
    await expect(translateWithGoogle({ texts: ['hi'], targetLang: 'JA', apiKey: 'dummy' })).rejects.not.toThrow('secret-value')
  })
})
