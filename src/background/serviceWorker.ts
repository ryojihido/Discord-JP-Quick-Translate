import { routeTranslation } from './api/providerRouter'
import { TranslationCache, buildCacheKey } from './cache/translationCache'
import { trackUsage, getUsageStats } from './usage/usageTracker'
import { AppError, isRecord, isProvider, errorMessage, readSettings, validateItems, type BatchItem } from '../shared/protocol'

const cache = new TranslationCache()
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  await cache.open()
  await cache.prune()
})()
// Initialization remains rejected; every request below awaits it and fails closed.
void ready.catch(() => console.error('[DJT] Initialization failed. Requests are disabled.'))
const active = new Set<AbortController>()
let epoch = 0
function invalidate(): void {
  epoch++
  for (const controller of active) controller.abort()
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ['enabled', 'targetLang', 'preferredProvider', 'cacheRevision', 'settingsRevision'].some(k => k in changes)) invalidate()
})
function authorize(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id) throw new AppError('送信元を確認できません。')
  const options = sender.url === chrome.runtime.getURL('src/options/options.html')
  const popup = sender.url === chrome.runtime.getURL('src/popup/popup.html')
  if (message.type === 'TRANSLATE_BATCH') {
    if (sender.frameId !== 0 || typeof sender.tab?.id !== 'number' || !sender.url ||
        !/^https:\/\/discord\.com\/channels\//.test(sender.url)) throw new AppError('翻訳要求の送信元が不正です。')
    validateItems(message.items)
  } else if (message.type === 'GET_USAGE') {
    if (!options && !popup) throw new AppError('この画面からは使用量を取得できません。')
  } else if (!options) {
    throw new AppError('設定ページから操作してください。')
  }
}
function validKey(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512 || /[\r\n]/.test(value)) throw new AppError('API キーの形式が不正です。')
  return value.trim()
}
async function translate(items: BatchItem[]) {
  const requestEpoch = epoch
  const controller = new AbortController()
  if (active.size >= 2) throw new AppError('翻訳要求が集中しています。少し待ってから再度操作してください。')
  active.add(controller)
  const check = () => { if (requestEpoch !== epoch || controller.signal.aborted) throw new AppError('設定変更またはキャッシュ削除により翻訳を中止しました。') }
  try {
    const settings = readSettings(await chrome.storage.sync.get(['enabled', 'targetLang', 'preferredProvider']))
    if (!settings.enabled) throw new AppError('翻訳機能はオフです。')
    await cache.prune()
    check()
    const results = []
    const missing = []
    for (const item of items) {
      const key = await buildCacheKey(item.text, settings.targetLang, settings.preferredProvider)
      const hit = await cache.get(key)
      if (hit) results.push({ id: item.id, translation: hit.translation, provider: hit.provider })
      else missing.push({ ...item, key })
    }
    if (missing.length) {
      const keys = await chrome.storage.local.get(['deeplKey', 'googleKey'])
      check()
      const { translations, provider } = await routeTranslation(missing.map(i => i.text), settings.targetLang,
        settings.preferredProvider, typeof keys.deeplKey === 'string' ? keys.deeplKey : null,
        typeof keys.googleKey === 'string' ? keys.googleKey : null, controller.signal)
      // Count successful API responses even when a later settings change discards the display.
      await trackUsage(provider, missing.reduce((sum, i) => sum + Array.from(i.text).length, 0))
      check()
      for (let i = 0; i < missing.length; i++) {
        check()
        const item = missing[i]
        await cache.set({ key: item.key, translation: translations[i], timestamp: Date.now(), provider })
        results.push({ id: item.id, translation: translations[i], provider })
      }
    }
    check()
    return { results }
  } finally { active.delete(controller) }
}
export async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (!isRecord(message) || typeof message.type !== 'string') throw new AppError('要求の形式が不正です。')
  authorize(message, sender)
  await ready
  switch (message.type) {
    case 'TRANSLATE_BATCH': return translate(message.items as BatchItem[])
    case 'GET_USAGE': return getUsageStats()
    case 'GET_CONFIG': {
      const settings = readSettings(await chrome.storage.sync.get(['enabled', 'targetLang', 'preferredProvider']))
      const keys = await chrome.storage.local.get(['deeplKey', 'googleKey'])
      return { ...settings, deeplKey: keys.deeplKey === undefined ? '' : validKey(keys.deeplKey),
        googleKey: keys.googleKey === undefined ? '' : validKey(keys.googleKey) }
    }
    case 'SAVE_SETTINGS': {
      if (!isRecord(message.settings)) throw new AppError('設定の形式が不正です。')
      const settings = readSettings(message.settings)
      const deeplKey = validKey(message.deeplKey)
      const googleKey = validKey(message.googleKey)
      invalidate()
      await chrome.storage.local.set({ deeplKey, googleKey })
      await chrome.storage.sync.set({ targetLang: settings.targetLang, preferredProvider: settings.preferredProvider,
        settingsRevision: crypto.randomUUID() })
      return { saved: true }
    }
    case 'TEST_API': {
      if (!isProvider(message.provider)) throw new AppError('翻訳先が不正です。')
      const key = validKey(message.key)
      await routeTranslation(['Hello'], 'JA', message.provider,
        message.provider === 'deepl' ? key : null, message.provider === 'google' ? key : null)
      await trackUsage(message.provider, 5)
      return { success: true }
    }
    case 'CLEAR_CACHE':
      invalidate()
      await cache.clear()
      await chrome.storage.sync.set({ cacheRevision: crypto.randomUUID() })
      return { success: true }
    default: throw new AppError('対応していない要求です。')
  }
}
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void handleMessage(message, sender).then(
    data => sendResponse({ ok: true, data }),
    error => sendResponse({ ok: false, error: errorMessage(error) }),
  )
  return true
})
