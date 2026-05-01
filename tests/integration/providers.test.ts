import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { translateWithDeepL, DeepLQuotaError } from '../../src/background/api/deeplProvider'
import { translateWithGoogle } from '../../src/background/api/googleProvider'
import { routeTranslation, resetRouterState } from '../../src/background/api/providerRouter'

const DEEPL_URL = 'https://api-free.deepl.com/v2/translate'
const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetRouterState()
})
afterAll(() => server.close())

describe('DeepL provider', () => {
  it('returns translated texts on success', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () =>
        HttpResponse.json({
          translations: [{ text: 'こんにちは' }, { text: '世界' }],
        }),
      ),
    )

    // Act
    const result = await translateWithDeepL({
      texts: ['Hello', 'World'],
      targetLang: 'JA',
      apiKey: 'test-key',
    })

    // Assert
    expect(result).toEqual(['こんにちは', '世界'])
  })

  it('throws DeepLQuotaError when status 456 is returned', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () =>
        new HttpResponse(null, { status: 456, statusText: 'Quota Exceeded' }),
      ),
    )

    // Act & Assert
    await expect(
      translateWithDeepL({ texts: ['Test'], targetLang: 'JA', apiKey: 'test-key' }),
    ).rejects.toThrow(DeepLQuotaError)
  })

  it('throws a generic error for non-456 HTTP failures', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () =>
        new HttpResponse(null, { status: 401, statusText: 'Unauthorized' }),
      ),
    )

    // Act & Assert
    await expect(
      translateWithDeepL({ texts: ['Test'], targetLang: 'JA', apiKey: 'bad-key' }),
    ).rejects.toThrow('DeepL API error: 401')
  })

  it('returns empty array when given empty texts array', async () => {
    // Arrange (no HTTP mock needed — returns early)

    // Act
    const result = await translateWithDeepL({ texts: [], targetLang: 'JA', apiKey: 'key' })

    // Assert
    expect(result).toEqual([])
  })
})

describe('Google provider', () => {
  it('returns translated texts on success', async () => {
    // Arrange
    server.use(
      http.post(GOOGLE_URL, () =>
        HttpResponse.json({
          data: {
            translations: [{ translatedText: 'こんにちは' }],
          },
        }),
      ),
    )

    // Act
    const result = await translateWithGoogle({
      texts: ['Hello'],
      targetLang: 'ja',
      apiKey: 'test-key',
    })

    // Assert
    expect(result).toEqual(['こんにちは'])
  })

  it('throws an error when the API returns a non-200 status', async () => {
    // Arrange
    server.use(
      http.post(GOOGLE_URL, () =>
        new HttpResponse(null, { status: 403, statusText: 'Forbidden' }),
      ),
    )

    // Act & Assert
    await expect(
      translateWithGoogle({ texts: ['Test'], targetLang: 'ja', apiKey: 'bad-key' }),
    ).rejects.toThrow('Google Translate API error: 403')
  })

  it('returns empty array when given empty texts array', async () => {
    // Arrange (no HTTP mock needed)

    // Act
    const result = await translateWithGoogle({ texts: [], targetLang: 'ja', apiKey: 'key' })

    // Assert
    expect(result).toEqual([])
  })
})

describe('providerRouter', () => {
  it('routes to DeepL when it is the preferred provider and key is available', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () =>
        HttpResponse.json({ translations: [{ text: '成功' }] }),
      ),
    )

    // Act
    const result = await routeTranslation(['success'], 'JA', 'deepl', 'deepl-key', 'google-key')

    // Assert
    expect(result.provider).toBe('deepl')
    expect(result.translations).toEqual(['成功'])
  })

  it('falls back to Google when DeepL returns quota exceeded (456)', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () => new HttpResponse(null, { status: 456 })),
      http.post(GOOGLE_URL, () =>
        HttpResponse.json({ data: { translations: [{ translatedText: 'フォールバック' }] } }),
      ),
    )

    // Act
    const result = await routeTranslation(['fallback'], 'JA', 'deepl', 'deepl-key', 'google-key')

    // Assert
    expect(result.provider).toBe('google')
    expect(result.translations).toEqual(['フォールバック'])
  })

  it('throws an error when DeepL quota is exceeded and no Google key is provided', async () => {
    // Arrange
    server.use(
      http.post(DEEPL_URL, () => new HttpResponse(null, { status: 456 })),
    )

    // Act & Assert
    await expect(
      routeTranslation(['test'], 'JA', 'deepl', 'deepl-key', null),
    ).rejects.toThrow('No translation API keys configured')
  })

  it('routes directly to Google when preferred provider is google', async () => {
    // Arrange
    server.use(
      http.post(GOOGLE_URL, () =>
        HttpResponse.json({ data: { translations: [{ translatedText: 'グーグル経由' }] } }),
      ),
    )

    // Act
    const result = await routeTranslation(['via google'], 'JA', 'google', 'deepl-key', 'google-key')

    // Assert
    expect(result.provider).toBe('google')
    expect(result.translations).toEqual(['グーグル経由'])
  })

  it('throws when no keys are configured at all', async () => {
    // Arrange (no mocks needed)

    // Act & Assert
    await expect(
      routeTranslation(['test'], 'JA', 'deepl', null, null),
    ).rejects.toThrow('No translation API keys configured')
  })
})
