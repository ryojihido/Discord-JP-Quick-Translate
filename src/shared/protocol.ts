export type ProviderName = 'deepl' | 'google'
export const MAX_ITEMS = 20
export const MAX_TEXT_LENGTH = 8000
export const MAX_BATCH_LENGTH = 16000
export const REQUEST_TIMEOUT_MS = 25000

export class AppError extends Error {}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function isProvider(value: unknown): value is ProviderName {
  return value === 'deepl' || value === 'google'
}
export function errorMessage(error: unknown): string {
  return error instanceof AppError ? error.message : '処理に失敗しました。拡張機能を再読み込みし、設定と接続を確認してください。'
}
export async function sendRequest<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('応答がタイムアウトしました。通信先で処理済みの場合もあります。')), REQUEST_TIMEOUT_MS)
    chrome.runtime.sendMessage(message, (response: unknown) => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(new AppError('拡張機能と通信できません。ページを再読み込みしてください。'))
      } else if (!isRecord(response) || typeof response.ok !== 'boolean') {
        reject(new AppError('拡張機能から不正な応答を受け取りました。'))
      } else if (!response.ok) {
        reject(new AppError(typeof response.error === 'string' ? response.error : '翻訳に失敗しました。'))
      } else {
        resolve(response.data as T)
      }
    })
  })
}
export interface BatchItem { readonly id: string; readonly text: string }
export interface BatchResult extends BatchItem { readonly translation: string; readonly provider: ProviderName }
export function validateItems(value: unknown): asserts value is BatchItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) throw new AppError('翻訳要求の件数が不正です。')
  const ids = new Set<string>()
  let total = 0
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 ||
        typeof item.text !== 'string' || !item.text.trim() || item.text.length > MAX_TEXT_LENGTH ||
        ids.has(item.id)) throw new AppError('翻訳要求の形式または長さが不正です。')
    ids.add(item.id)
    total += item.text.length
  }
  if (total > MAX_BATCH_LENGTH) throw new AppError('一度に翻訳する文章が長すぎます。')
}
export function readSettings(value: Record<string, unknown>) {
  // Defaults apply only to settings that have never been saved.
  const targetLang = value.targetLang === undefined ? 'JA' : value.targetLang
  const preferredProvider = value.preferredProvider === undefined ? 'deepl' : value.preferredProvider
  const enabled = value.enabled === undefined ? true : value.enabled
  if (typeof targetLang !== 'string' || !['JA', 'EN', 'ZH', 'KO', 'FR', 'DE'].includes(targetLang) ||
      !isProvider(preferredProvider) || typeof enabled !== 'boolean') throw new AppError('保存された設定が不正です。設定画面で保存し直してください。')
  return { targetLang, preferredProvider, enabled }
}
