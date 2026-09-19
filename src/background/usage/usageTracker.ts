import { AppError, isRecord, type ProviderName } from '../../shared/protocol'
export const DEEPL_FREE_MONTHLY_LIMIT = 500_000
export interface ProviderUsage { readonly chars: number; readonly month: number }
export interface UsageStats { readonly deepl: ProviderUsage; readonly google: ProviderUsage }
let lock = Promise.resolve()
async function loadUsage(provider: ProviderName): Promise<ProviderUsage> {
  const now = new Date()
  const month = now.getFullYear() * 100 + now.getMonth() + 1
  const data = await chrome.storage.local.get('usage_' + provider)
  const stored: unknown = data['usage_' + provider]
  if (stored === undefined) return { chars: 0, month }
  if (!isRecord(stored) || !Number.isSafeInteger(stored.chars) || (stored.chars as number) < 0 || !Number.isInteger(stored.month)) {
    throw new AppError('保存された使用量が不正です。')
  }
  return stored.month === month ? { chars: stored.chars as number, month } : { chars: 0, month }
}
export async function trackUsage(provider: ProviderName, charCount: number): Promise<ProviderUsage> {
  if (!Number.isSafeInteger(charCount) || charCount < 0) throw new AppError('使用量の値が不正です。')
  const previous = lock
  let release!: () => void
  lock = new Promise<void>(resolve => { release = resolve })
  await previous
  try {
    const current = await loadUsage(provider)
    const updated = { chars: current.chars + charCount, month: current.month }
    await chrome.storage.local.set({ ['usage_' + provider]: updated })
    return updated
  } finally {
    // Release the lock even on failure; the caller still receives the rejection.
    release()
  }
}
export async function getUsageStats(): Promise<UsageStats> {
  await lock
  const [deepl, google] = await Promise.all([loadUsage('deepl'), loadUsage('google')])
  return { deepl, google }
}
