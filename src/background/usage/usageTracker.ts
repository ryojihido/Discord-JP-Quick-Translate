export const DEEPL_FREE_MONTHLY_LIMIT = 500_000

export interface ProviderUsage {
  readonly chars: number
  readonly month: number
}

export interface UsageStats {
  readonly deepl: ProviderUsage
  readonly google: ProviderUsage
}

function getCurrentMonthKey(): number {
  const now = new Date()
  return now.getFullYear() * 100 + (now.getMonth() + 1)
}

async function loadUsage(provider: 'deepl' | 'google'): Promise<ProviderUsage> {
  const currentMonth = getCurrentMonthKey()

  return new Promise((resolve) => {
    chrome.storage.local.get([`usage_${provider}`], (result) => {
      const stored = result[`usage_${provider}`] as ProviderUsage | undefined
      if (!stored || stored.month !== currentMonth) {
        resolve({ chars: 0, month: currentMonth })
      } else {
        resolve(stored)
      }
    })
  })
}

async function saveUsage(provider: 'deepl' | 'google', usage: ProviderUsage): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [`usage_${provider}`]: usage }, resolve)
  })
}

export async function trackUsage(
  provider: 'deepl' | 'google',
  charCount: number,
): Promise<ProviderUsage> {
  const current = await loadUsage(provider)
  const updated: ProviderUsage = {
    chars: current.chars + charCount,
    month: current.month,
  }
  await saveUsage(provider, updated)
  return updated
}

export async function getUsageStats(): Promise<UsageStats> {
  const [deepl, google] = await Promise.all([loadUsage('deepl'), loadUsage('google')])
  return { deepl, google }
}
