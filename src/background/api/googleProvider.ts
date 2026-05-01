const GOOGLE_API_URL = 'https://translation.googleapis.com/language/translate/v2'

export interface GoogleTranslateParams {
  readonly texts: ReadonlyArray<string>
  readonly targetLang: string
  readonly apiKey: string
}

interface GoogleTranslateResponse {
  readonly data: {
    readonly translations: ReadonlyArray<{ readonly translatedText: string }>
  }
}

export async function translateWithGoogle(params: GoogleTranslateParams): Promise<string[]> {
  const { texts, targetLang, apiKey } = params

  if (texts.length === 0) return []

  const url = `${GOOGLE_API_URL}?key=${encodeURIComponent(apiKey)}`

  const body = {
    q: [...texts],
    target: targetLang.toLowerCase(),
    format: 'html',
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as GoogleTranslateResponse
  return data.data.translations.map((t) => t.translatedText)
}
