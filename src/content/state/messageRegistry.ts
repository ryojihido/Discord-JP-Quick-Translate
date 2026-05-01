export interface TranslationEntry {
  readonly translation: string
  readonly provider: string
  readonly timestamp: number
}

export class MessageRegistry {
  private readonly byMessageId = new Map<string, TranslationEntry>()
  private readonly byContentHash = new Map<string, TranslationEntry>()

  getById(messageId: string): TranslationEntry | undefined {
    return this.byMessageId.get(messageId)
  }

  getByHash(contentHash: string): TranslationEntry | undefined {
    return this.byContentHash.get(contentHash)
  }

  set(messageId: string, contentHash: string, entry: TranslationEntry): void {
    this.byMessageId.set(messageId, entry)
    this.byContentHash.set(contentHash, entry)
  }

  delete(messageId: string): void {
    this.byMessageId.delete(messageId)
  }

  clear(): void {
    this.byMessageId.clear()
    this.byContentHash.clear()
  }

  size(): number {
    return this.byMessageId.size
  }
}
