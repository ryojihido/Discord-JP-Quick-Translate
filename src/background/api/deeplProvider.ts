import { AppError, isRecord, MAX_BATCH_LENGTH, MAX_ITEMS, MAX_TEXT_LENGTH } from '../../shared/protocol'
import { postJson } from './http'
export interface DeepLTranslateParams {
  readonly texts: ReadonlyArray<string>; readonly targetLang: string; readonly apiKey: string; readonly signal?: AbortSignal
}
export function validateTexts(texts: ReadonlyArray<string>): void {
  if (texts.length > MAX_ITEMS || texts.some(t => typeof t !== 'string' || !t.trim() || t.length > MAX_TEXT_LENGTH) ||
      texts.reduce((n, t) => n + t.length, 0) > MAX_BATCH_LENGTH) throw new AppError('翻訳する文章が長すぎるか、形式が不正です。')
}
export async function translateWithDeepL({ texts, targetLang, apiKey, signal }: DeepLTranslateParams): Promise<string[]> {
  validateTexts(texts)
  if (texts.length === 0) return []
  const data = await postJson('https://api-free.deepl.com/v2/translate', { Authorization: 'DeepL-Auth-Key ' + apiKey },
    { text: [...texts], target_lang: targetLang.toUpperCase() }, signal)
  if (!isRecord(data) || !Array.isArray(data.translations) || data.translations.length !== texts.length ||
      !data.translations.every(t => isRecord(t) && typeof t.text === 'string' && t.text.trim() && t.text.length <= 32000)) {
    throw new AppError('DeepL の翻訳結果の件数または形式が不正です。')
  }
  return data.translations.map(t => t.text as string)
}
