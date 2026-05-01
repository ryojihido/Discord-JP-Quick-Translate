import { routeTranslation, type ProviderName } from './api/providerRouter'
import { TranslationCache, buildCacheKey } from './cache/translationCache'
import { trackUsage, getUsageStats } from './usage/usageTracker'
import { tokenize } from '../content/extractor/tokenizer'

const cache = new TranslationCache()

cache.open().catch((err) => {
  console.error('[DJT] Failed to open cache DB:', err)
})

interface TranslateSingleMessage {
  readonly type: 'TRANSLATE_SINGLE'
  readonly text: string
  readonly targetLang: string
}

interface TranslateBatchMessage {
  readonly type: 'TRANSLATE_BATCH'
  readonly items: ReadonlyArray<{ readonly id: string; readonly text: string }>
}

interface TranslationResponseItem {
  readonly id: string
  readonly translation: string
  readonly provider: ProviderName
}

interface GetUsageMessage {
  readonly type: 'GET_USAGE'
}

interface SetApiKeyMessage {
  readonly type: 'SET_API_KEY'
  readonly provider: 'deepl' | 'google'
  readonly key: string
}

interface GetApiKeyMessage {
  readonly type: 'GET_API_KEY'
  readonly provider: 'deepl' | 'google'
}

interface ClearCacheMessage {
  readonly type: 'CLEAR_CACHE'
}

type IncomingMessage =
  | TranslateSingleMessage
  | TranslateBatchMessage
  | GetUsageMessage
  | SetApiKeyMessage
  | GetApiKeyMessage
  | ClearCacheMessage

async function getStoredKeys(): Promise<{
  deeplKey: string | null
  googleKey: string | null
  targetLang: string
  preferredProvider: ProviderName
}> {
  const settings = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.sync.get(['targetLang', 'preferredProvider'], resolve)
  })

  const keys = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(['deeplKey', 'googleKey'], resolve)
  })

  return {
    deeplKey: (keys.deeplKey as string | undefined) || null,
    googleKey: (keys.googleKey as string | undefined) || null,
    targetLang: (settings.targetLang as string | undefined) ?? 'JA',
    preferredProvider: ((settings.preferredProvider as string | undefined) ?? 'deepl') as ProviderName,
  }
}

async function translateTexts(
  texts: string[],
): Promise<{ translations: string[]; provider: ProviderName }> {
  const { deeplKey, googleKey, targetLang, preferredProvider } = await getStoredKeys()

  const result = await routeTranslation(texts, targetLang, preferredProvider, deeplKey, googleKey)

  const totalChars = texts.reduce((sum, t) => sum + t.length, 0)
  await trackUsage(result.provider, totalChars)

  return result
}

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse: (response: unknown) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        console.error('[DJT] Message handler error:', err)
        sendResponse({ error: (err as Error).message })
      })
    return true
  },
)

async function handleMessage(message: IncomingMessage): Promise<unknown> {
  switch (message.type) {
    case 'TRANSLATE_SINGLE': {
      const { targetLang } = await getStoredKeys()
      const { translatable, restore } = tokenize(message.text)
      const cacheKey = await buildCacheKey(translatable, targetLang, 'any')

      const cached = await cache.get(cacheKey)
      if (cached) {
        return { translation: restore(cached.translation), provider: cached.provider }
      }

      const { translations, provider } = await translateTexts([translatable])
      const raw = translations[0] ?? ''
      const translation = restore(raw)

      await cache.set({ key: cacheKey, translation: raw, timestamp: Date.now(), provider })

      return { translation, provider }
    }

    case 'TRANSLATE_BATCH': {
      const { targetLang } = await getStoredKeys()
      const results: TranslationResponseItem[] = []
      const toTranslate: Array<{ id: string; translatable: string; restore: (s: string) => string }> = []

      for (const item of message.items) {
        const { translatable, restore } = tokenize(item.text)
        const cacheKey = await buildCacheKey(translatable, targetLang, 'any')
        const cached = await cache.get(cacheKey)

        if (cached) {
          results.push({
            id: item.id,
            translation: restore(cached.translation),
            provider: cached.provider as ProviderName,
          })
        } else {
          toTranslate.push({ id: item.id, translatable, restore })
        }
      }

      if (toTranslate.length > 0) {
        const { translations, provider } = await translateTexts(
          toTranslate.map((t) => t.translatable),
        )

        for (let i = 0; i < toTranslate.length; i++) {
          const item = toTranslate[i]
          const raw = translations[i] ?? ''
          const translation = item.restore(raw)
          const cacheKey = await buildCacheKey(item.translatable, targetLang, 'any')
          await cache.set({ key: cacheKey, translation: raw, timestamp: Date.now(), provider })
          results.push({ id: item.id, translation, provider })
        }
      }

      return { results }
    }

    case 'GET_USAGE': {
      const stats = await getUsageStats()
      return { deepl: stats.deepl, google: stats.google }
    }

    case 'SET_API_KEY': {
      return new Promise<void>((resolve) => {
        const storageKey = `${message.provider}Key`
        const trimmedKey = message.key.trim()
        if (trimmedKey) {
          chrome.storage.local.set({ [storageKey]: trimmedKey }, resolve)
        } else {
          chrome.storage.local.remove(storageKey, resolve)
        }
      })
    }

    case 'GET_API_KEY': {
      return new Promise((resolve) => {
        chrome.storage.local.get([`${message.provider}Key`], (result) => {
          resolve({ key: (result[`${message.provider}Key`] as string | undefined) ?? null })
        })
      })
    }

    case 'CLEAR_CACHE': {
      await cache.clear()
      return { success: true }
    }

    default:
      return { error: 'Unknown message type' }
  }
}
