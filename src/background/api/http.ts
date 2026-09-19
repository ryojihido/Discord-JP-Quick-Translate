import { AppError } from '../../shared/protocol'
export const API_TIMEOUT_MS = 15000
export async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, API_TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: controller.signal, credentials: 'omit', redirect: 'error' })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new AppError('API の認証・権限エラーです。キーと利用制限を確認してください。')
      if (response.status === 456) throw new AppError('DeepL の利用上限に達しました。別の翻訳先へ自動切替はしません。')
      if (response.status === 429) throw new AppError('API の利用上限または送信頻度の制限に達しました。時間をおいてください。')
      throw new AppError('翻訳 API がエラーを返しました（HTTP ' + response.status + '）。')
    }
    return await response.json()
  } catch (error) {
    if (error instanceof AppError) throw error
    if (controller.signal.aborted) throw new AppError('翻訳を中止したか、通信がタイムアウトしました。通信先で処理済みの場合もあります。')
    throw new AppError('翻訳 API と通信できないか、応答が不正です。')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
