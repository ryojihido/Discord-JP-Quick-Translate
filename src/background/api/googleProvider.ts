import { AppError, isRecord } from '../../shared/protocol'
import { validateTexts, type DeepLTranslateParams } from './deeplProvider'
import { postJson } from './http'
export async function translateWithGoogle({ texts, targetLang, apiKey, signal }: DeepLTranslateParams): Promise<string[]> {
  validateTexts(texts)
  if (texts.length === 0) return []
  const data = await postJson('https://translation.googleapis.com/language/translate/v2', { 'x-goog-api-key': apiKey },
    { q: [...texts], target: targetLang.toLowerCase(), format: 'text' }, signal)
  if (!isRecord(data) || !isRecord(data.data) || !Array.isArray(data.data.translations) ||
      data.data.translations.length !== texts.length ||
      !data.data.translations.every(t => isRecord(t) && typeof t.translatedText === 'string' && t.translatedText.trim() && t.translatedText.length <= 32000)) {
    throw new AppError('Google の翻訳結果の件数または形式が不正です。')
  }
  return data.data.translations.map(t => t.translatedText as string)
}
