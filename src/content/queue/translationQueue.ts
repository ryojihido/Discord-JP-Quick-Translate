import { AppError, isRecord, isProvider, sendRequest, validateItems, MAX_ITEMS, MAX_BATCH_LENGTH } from '../../shared/protocol'
export interface TranslationResult { readonly translation: string; readonly provider: string }
export interface QueueItem {
  readonly id: string; readonly text: string; readonly isInViewport: boolean
  readonly resolve: (result: TranslationResult) => void; readonly reject: (error: Error) => void
}
export class TranslationQueue {
  private pending: QueueItem[] = []
  private inFlight: QueueItem[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  enqueue(item: QueueItem): void {
    try { validateItems([{ id: item.id, text: item.text }]) }
    catch (error) { item.reject(error as Error); return }
    if (this.pending.length >= 100) { item.reject(new AppError('翻訳待ちが多すぎます。')); return }
    this.pending.push(item)
    this.schedule()
  }
  cancel(): void {
    this.generation++
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const error = new AppError('翻訳を中止しました。')
    for (const item of [...this.pending, ...this.inFlight]) item.reject(error)
    this.pending = []
    // An already-sent request keeps the slot until its callback/timeout settles.
  }
  private schedule(): void {
    if (this.timer !== null || this.inFlight.length || !this.pending.length) return
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, 250)
  }
  private async flush(): Promise<void> {
    this.pending.sort((a, b) => Number(b.isInViewport) - Number(a.isInViewport))
    const batch: QueueItem[] = []
    let length = 0
    while (this.pending.length && batch.length < MAX_ITEMS && length + this.pending[0].text.length <= MAX_BATCH_LENGTH) {
      const item = this.pending.shift()!
      length += item.text.length
      batch.push(item)
    }
    this.inFlight = batch
    const generation = this.generation
    try {
      const data = await sendRequest<unknown>({ type: 'TRANSLATE_BATCH', items: batch.map(({ id, text }) => ({ id, text })) })
      if (generation !== this.generation) return
      if (!isRecord(data) || !Array.isArray(data.results) || data.results.length !== batch.length) throw new AppError('翻訳結果の件数が不正です。')
      const resultMap = new Map<string, TranslationResult>()
      for (const result of data.results) {
        if (!isRecord(result) || typeof result.id !== 'string' || typeof result.translation !== 'string' ||
            !result.translation.trim() || !isProvider(result.provider) || resultMap.has(result.id)) throw new AppError('翻訳結果の形式が不正です。')
        resultMap.set(result.id, { translation: result.translation, provider: result.provider })
      }
      if (batch.some(item => !resultMap.has(item.id))) throw new AppError('翻訳結果の対応が不正です。')
      for (const item of batch) item.resolve(resultMap.get(item.id)!)
    } catch (error) {
      if (generation === this.generation) for (const item of batch) item.reject(error as Error)
    } finally { this.inFlight = []; this.schedule() }
  }
}
