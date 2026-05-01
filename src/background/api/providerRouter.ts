import { translateWithDeepL, DeepLQuotaError } from './deeplProvider'
import { translateWithGoogle } from './googleProvider'

export type ProviderName = 'deepl' | 'google'

export interface RouteResult {
  readonly translations: string[]
  readonly provider: ProviderName
}

interface RouterState {
  readonly deeplExhaustedMonth: number | null
}

let state: RouterState = { deeplExhaustedMonth: null }

function isDeepLExhausted(): boolean {
  if (state.deeplExhaustedMonth === null) return false
  const exhaustedMonth = state.deeplExhaustedMonth
  const currentMonth = getCurrentMonthKey()
  return exhaustedMonth === currentMonth
}

function getCurrentMonthKey(): number {
  const now = new Date()
  return now.getFullYear() * 100 + (now.getMonth() + 1)
}

function markDeepLExhausted(): void {
  state = { ...state, deeplExhaustedMonth: getCurrentMonthKey() }
}

export async function routeTranslation(
  texts: ReadonlyArray<string>,
  targetLang: string,
  preferredProvider: ProviderName,
  deeplKey: string | null,
  googleKey: string | null,
): Promise<RouteResult> {
  const shouldUseDeepL = preferredProvider === 'deepl' && deeplKey && !isDeepLExhausted()

  if (shouldUseDeepL && deeplKey) {
    try {
      const translations = await translateWithDeepL({
        texts,
        targetLang,
        apiKey: deeplKey,
      })
      return { translations, provider: 'deepl' }
    } catch (error) {
      if (error instanceof DeepLQuotaError) {
        markDeepLExhausted()
      } else {
        throw error
      }
    }
  }

  if (!googleKey) {
    throw new Error('No translation API keys configured. Please add an API key in the options.')
  }

  const translations = await translateWithGoogle({
    texts,
    targetLang,
    apiKey: googleKey,
  })

  return { translations, provider: 'google' }
}

export function resetRouterState(): void {
  state = { deeplExhaustedMonth: null }
}
