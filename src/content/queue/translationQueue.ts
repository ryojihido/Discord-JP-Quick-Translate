export interface QueueItem {
  readonly id: string
  readonly text: string
  readonly isInViewport: boolean
  readonly resolve: (result: TranslationResult) => void
  readonly reject: (error: Error) => void
}

export interface TranslationResult {
  readonly translation: string
  readonly provider: string
}

interface BatchMessage {
  readonly type: 'TRANSLATE_BATCH'
  readonly items: ReadonlyArray<{ readonly id: string; readonly text: string }>
}

interface BatchResult {
  readonly results: ReadonlyArray<{
    readonly id: string
    readonly translation: string
    readonly provider: string
  }>
}

const DEBOUNCE_MS = 250

export class TranslationQueue {
  private pending: QueueItem[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  enqueue(item: QueueItem): void {
    this.pending = [...this.pending, item]

    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.flush()
    }, DEBOUNCE_MS)
  }

  private flush(): void {
    const batch = this.pending
    this.pending = []
    this.timer = null

    if (batch.length === 0) return

    const sorted = [...batch].sort((a, b) => {
      if (a.isInViewport && !b.isInViewport) return -1
      if (!a.isInViewport && b.isInViewport) return 1
      return 0
    })

    const message: BatchMessage = {
      type: 'TRANSLATE_BATCH',
      items: sorted.map(({ id, text }) => ({ id, text })),
    }

    chrome.runtime.sendMessage(message, (response: BatchResult | undefined) => {
      if (chrome.runtime.lastError || !response) {
        const error = new Error(chrome.runtime.lastError?.message ?? 'Translation batch failed')
        sorted.forEach((item) => item.reject(error))
        return
      }

      const resultMap = new Map(response.results.map((r) => [r.id, r]))

      sorted.forEach((item) => {
        const result = resultMap.get(item.id)
        if (result !== undefined) {
          item.resolve({ translation: result.translation, provider: result.provider })
        } else {
          item.reject(new Error(`No translation returned for message ${item.id}`))
        }
      })
    })
  }
}
