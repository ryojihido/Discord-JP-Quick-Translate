import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'

const DEBOUNCE_MS = 250

interface QueueItem {
  id: string
  text: string
  isInViewport: boolean
  resolve: (result: string) => void
  reject: (error: Error) => void
}

interface BatchMessage {
  type: 'TRANSLATE_BATCH'
  items: Array<{ id: string; text: string }>
}

type SendMessageCallback = (response: unknown) => void

class TestTranslationQueue {
  private pending: QueueItem[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly sendMessage: (msg: BatchMessage, cb: SendMessageCallback) => void

  constructor(sendMessage: (msg: BatchMessage, cb: SendMessageCallback) => void) {
    this.sendMessage = sendMessage
  }

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

    this.sendMessage(message, (response: unknown) => {
      const res = response as { results: Array<{ id: string; translation: string }> } | undefined
      if (!res) {
        const error = new Error('Batch failed')
        sorted.forEach((item) => item.reject(error))
        return
      }

      const resultMap = new Map(res.results.map((r) => [r.id, r.translation]))
      sorted.forEach((item) => {
        const translation = resultMap.get(item.id)
        if (translation !== undefined) {
          item.resolve(translation)
        } else {
          item.reject(new Error(`No translation for ${item.id}`))
        }
      })
    })
  }
}

describe('TranslationQueue', () => {
  let sentMessages: BatchMessage[]
  let sendCallbacks: SendMessageCallback[]
  let queue: TestTranslationQueue

  beforeEach(() => {
    vi.useFakeTimers()
    sentMessages = []
    sendCallbacks = []

    queue = new TestTranslationQueue((msg, cb) => {
      sentMessages.push(msg)
      sendCallbacks.push(cb)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches items enqueued within 250ms into a single message', async () => {
    // Arrange
    const resolvers: Array<{ resolve: (v: string) => void; reject: (e: Error) => void }> = []
    const promises = ['msg-1', 'msg-2', 'msg-3'].map((id) =>
      new Promise<string>((resolve, reject) => {
        resolvers.push({ resolve, reject })
        queue.enqueue({ id, text: `text ${id}`, isInViewport: false, resolve, reject })
      })
    )

    // Act
    vi.advanceTimersByTime(DEBOUNCE_MS)

    // Assert
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].items).toHaveLength(3)
    expect(sentMessages[0].type).toBe('TRANSLATE_BATCH')
  })

  it('creates a new batch for items added after the debounce window closes', () => {
    // Arrange
    const noop = { resolve: () => {}, reject: () => {} }

    queue.enqueue({ id: 'first', text: 'hello', isInViewport: false, ...noop })

    // Act: flush first batch
    vi.advanceTimersByTime(DEBOUNCE_MS)

    // Add item after flush
    queue.enqueue({ id: 'second', text: 'world', isInViewport: false, ...noop })

    // Act: flush second batch
    vi.advanceTimersByTime(DEBOUNCE_MS)

    // Assert
    expect(sentMessages).toHaveLength(2)
    expect(sentMessages[0].items[0].id).toBe('first')
    expect(sentMessages[1].items[0].id).toBe('second')
  })

  it('sorts viewport items before non-viewport items in a batch', () => {
    // Arrange
    const noop = { resolve: () => {}, reject: () => {} }

    queue.enqueue({ id: 'out-1', text: 'a', isInViewport: false, ...noop })
    queue.enqueue({ id: 'in-1', text: 'b', isInViewport: true, ...noop })
    queue.enqueue({ id: 'out-2', text: 'c', isInViewport: false, ...noop })
    queue.enqueue({ id: 'in-2', text: 'd', isInViewport: true, ...noop })

    // Act
    vi.advanceTimersByTime(DEBOUNCE_MS)

    // Assert
    const ids = sentMessages[0].items.map((item) => item.id)
    const firstTwo = ids.slice(0, 2)
    const lastTwo = ids.slice(2)
    expect(firstTwo).toEqual(expect.arrayContaining(['in-1', 'in-2']))
    expect(lastTwo).toEqual(expect.arrayContaining(['out-1', 'out-2']))
  })

  it('resolves item promises when the service worker returns translations', async () => {
    // Arrange
    const promise = new Promise<string>((resolve, reject) => {
      queue.enqueue({ id: 'test-id', text: 'hello', isInViewport: false, resolve, reject })
    })

    // Act
    vi.advanceTimersByTime(DEBOUNCE_MS)

    sendCallbacks[0]({ results: [{ id: 'test-id', translation: 'こんにちは' }] })

    // Assert
    const result = await promise
    expect(result).toBe('こんにちは')
  })

  it('rejects item promises when the service worker returns undefined', async () => {
    // Arrange
    const promise = new Promise<string>((resolve, reject) => {
      queue.enqueue({ id: 'fail-id', text: 'test', isInViewport: false, resolve, reject })
    })

    // Act
    vi.advanceTimersByTime(DEBOUNCE_MS)
    sendCallbacks[0](undefined)

    // Assert
    await expect(promise).rejects.toThrow('Batch failed')
  })

  it('debounce resets when new items arrive before timeout expires', () => {
    // Arrange
    const noop = { resolve: () => {}, reject: () => {} }

    queue.enqueue({ id: 'a', text: 'a', isInViewport: false, ...noop })

    // Act: advance only 100ms (not yet flushed)
    vi.advanceTimersByTime(100)
    expect(sentMessages).toHaveLength(0)

    // Add another item — should reset debounce
    queue.enqueue({ id: 'b', text: 'b', isInViewport: false, ...noop })

    // Advance 200ms — original debounce would have fired but not reset one
    vi.advanceTimersByTime(200)
    expect(sentMessages).toHaveLength(0)

    // Advance remaining 50ms to complete the 250ms from 'b'
    vi.advanceTimersByTime(50)
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0].items).toHaveLength(2)
  })
})
