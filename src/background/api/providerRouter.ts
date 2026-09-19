import { translateWithDeepL } from './deeplProvider'
import { translateWithGoogle } from './googleProvider'
import { AppError, isProvider, type ProviderName } from '../../shared/protocol'
export type { ProviderName } from '../../shared/protocol'
export async function routeTranslation(texts: ReadonlyArray<string>, targetLang: string, provider: ProviderName,
  deeplKey: string | null, googleKey: string | null, signal?: AbortSignal) {
  if (!isProvider(provider)) throw new AppError('翻訳先の設定が不正です。')
  const key = provider === 'deepl' ? deeplKey : googleKey
  if (!key) throw new AppError('選択した翻訳先の API キーを設定してください。')
  const translate = provider === 'deepl' ? translateWithDeepL : translateWithGoogle
  return { translations: await translate({ texts, targetLang, apiKey: key, signal }), provider }
}
