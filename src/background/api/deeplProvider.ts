const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate'
const MAX_TEXTS_PER_REQUEST = 50

export class DeepLQuotaError extends Error {
  constructor() {
    super('DeepL quota exceeded')
    this.name = 'DeepLQuotaError'
  }
}

export interface DeepLTranslateParams {
  readonly texts: ReadonlyArray<string>
  readonly targetLang: string
  readonly apiKey: string
}

export interface TranslationResult {
  readonly translations: ReadonlyArray<{ readonly text: string }>
}

export async function translateWithDeepL(params: DeepLTranslateParams): Promise<string[]> {
  const { texts, targetLang, apiKey } = params

  if (texts.length === 0) return []

  const batches = chunkArray([...texts], MAX_TEXTS_PER_REQUEST)
  const results: string[] = []

  for (const batch of batches) {
    const body = new URLSearchParams()
    batch.forEach((text) => body.append('text', text))
    body.set('target_lang', targetLang.toUpperCase())
    body.set('tag_handling', 'xml')

    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (response.status === 456) {
      throw new DeepLQuotaError()
    }

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as TranslationResult
    data.translations.forEach((t) => results.push(t.text))
  }

  return results
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
