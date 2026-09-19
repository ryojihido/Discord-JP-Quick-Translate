import { extractMessageParts, extractMessageText } from '../extractor/messageExtractor'
import { tokenize } from '../extractor/tokenizer'
import { TranslationQueue } from '../queue/translationQueue'
import { AppError, errorMessage, MAX_TEXT_LENGTH } from '../../shared/protocol'
const BTN = 'data-djt-btn'
const BLOCK = 'data-djt-block'
export class TranslationRenderer {
  private generation = 0
  constructor(private readonly queue: TranslationQueue) {}
  injectButton(message: Element): void {
    if (message.querySelector('[' + BTN + ']') || !extractMessageText(message)) return
    const button = document.createElement('button')
    button.className = 'djt-translate-btn'
    button.textContent = '🌐 翻訳'
    button.setAttribute(BTN, 'true')
    button.addEventListener('click', event => {
      event.stopPropagation()
      if (event.isTrusted) void this.handleButtonClick(message, button)
    })
    message.appendChild(button)
  }
  private async handleButtonClick(message: Element, button: HTMLButtonElement): Promise<void> {
    if (button.disabled) return
    const parts = extractMessageParts(message)
    const original = JSON.stringify(parts)
    const existing = message.querySelector<HTMLElement>('[' + BLOCK + ']')
    if (existing?.dataset.source === original && existing.dataset.success === 'true') {
      existing.hidden = !existing.hidden
      button.textContent = existing.hidden ? '🌐 翻訳' : '✓ 非表示'
      return
    }
    existing?.remove()
    const generation = this.generation
    const valid = () => generation === this.generation && button.isConnected &&
      JSON.stringify(extractMessageParts(message)) === original
    button.disabled = true
    const block = document.createElement('div')
    block.className = 'djt-translation-block'
    block.setAttribute(BLOCK, 'true')
    block.textContent = '翻訳中...'
    message.appendChild(block)
    try {
      if (parts.reduce((n, p) => n + p.text.length, 0) > MAX_TEXT_LENGTH) throw new AppError('文章が長すぎます（上限 8,000 文字）。')
      const tokens = tokenize(parts)
      if (tokens.texts.length === 0) throw new AppError('翻訳する文章がありません。コードなどは送信しません。')
      const requestId = crypto.randomUUID()
      const rect = message.getBoundingClientRect()
      const results = await Promise.all(tokens.texts.map((text, index) => new Promise<{ translation: string; provider: string }>((resolve, reject) => {
        this.queue.enqueue({ id: requestId + '-' + index, text, isInViewport: rect.top >= 0 && rect.bottom <= window.innerHeight, resolve, reject })
      })))
      if (!valid()) { block.remove(); return }
      block.textContent = ''
      const text = document.createElement('span')
      text.className = 'djt-translation-text'
      text.textContent = tokens.restore(results.map(r => r.translation))
      const badge = document.createElement('span')
      badge.className = 'djt-provider-badge ' + (results[0].provider === 'deepl' ? 'djt-deepl' : 'djt-google')
      badge.textContent = results[0].provider === 'deepl' ? 'DeepL' : 'Google'
      block.append(text, badge)
      block.dataset.source = original
      block.dataset.success = 'true'
      button.textContent = '✓ 非表示'
    } catch (error) {
      if (!valid()) { block.remove(); return }
      block.textContent = errorMessage(error)
      block.style.borderLeftColor = '#ed4245'
      button.textContent = '再試行'
    } finally { button.disabled = false }
  }
  cleanup(): void {
    this.generation++
    this.queue.cancel()
    document.querySelectorAll('[' + BTN + '],[' + BLOCK + ']').forEach(el => el.remove())
  }
}
