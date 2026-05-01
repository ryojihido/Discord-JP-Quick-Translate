import { extractMessageText } from '../extractor/messageExtractor'
import { getMessageId } from '../observer/domSelectors'
import { TranslationQueue } from '../queue/translationQueue'
import { MessageRegistry } from '../state/messageRegistry'

const DJT_BTN_ATTR = 'data-djt-btn'
const DJT_BLOCK_ATTR = 'data-djt-block'
const DJT_HASH_ATTR = 'data-djt-hash'

async function hashText(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  return rect.top >= 0 && rect.bottom <= window.innerHeight
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'djt-translate-btn'
  btn.textContent = '🌐 翻訳'
  btn.setAttribute(DJT_BTN_ATTR, 'true')
  return btn
}

function createLoadingBlock(): HTMLDivElement {
  const block = document.createElement('div')
  block.className = 'djt-translation-block'
  block.setAttribute(DJT_BLOCK_ATTR, 'true')
  block.innerHTML = `
    <div class="djt-loading">
      <div class="djt-spinner"></div>
      <span>翻訳中...</span>
    </div>
  `
  return block
}

function createResultBlock(translation: string, provider: string): HTMLDivElement {
  const block = document.createElement('div')
  block.className = 'djt-translation-block'
  block.setAttribute(DJT_BLOCK_ATTR, 'true')

  const providerClass = provider.toLowerCase().includes('deepl') ? 'djt-deepl' : 'djt-google'
  const providerLabel = provider.toLowerCase().includes('deepl') ? 'DeepL' : 'Google'

  block.innerHTML = `
    <span class="djt-translation-text">${escapeHtml(translation)}</span>
    <span class="djt-provider-badge ${providerClass}">${providerLabel}</span>
  `
  return block
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function removeExistingBlock(messageEl: Element): void {
  messageEl.querySelector(`[${DJT_BLOCK_ATTR}]`)?.remove()
}

export class TranslationRenderer {
  private readonly queue: TranslationQueue
  private readonly registry: MessageRegistry

  constructor(queue: TranslationQueue, registry: MessageRegistry) {
    this.queue = queue
    this.registry = registry
  }

  injectButton(messageEl: Element): void {
    if (messageEl.querySelector(`[${DJT_BTN_ATTR}]`)) return

    const text = extractMessageText(messageEl)
    if (!text) return

    const btn = createButton()

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.handleButtonClick(messageEl, btn, text)
    })

    messageEl.appendChild(btn)
  }

  private async handleButtonClick(
    messageEl: Element,
    btn: HTMLButtonElement,
    text: string,
  ): Promise<void> {
    const existingBlock = messageEl.querySelector(`[${DJT_BLOCK_ATTR}]`)

    if (existingBlock) {
      const isHidden = (existingBlock as HTMLElement).style.display === 'none'
      ;(existingBlock as HTMLElement).style.display = isHidden ? '' : 'none'
      btn.textContent = isHidden ? '✓ 非表示' : '🌐 翻訳'
      return
    }

    const hash = await hashText(text)
    const messageId = getMessageId(messageEl) ?? hash

    const cached = this.registry.getByHash(hash)
    if (cached) {
      const block = createResultBlock(cached.translation, cached.provider)
      messageEl.appendChild(block)
      btn.textContent = '✓ 非表示'
      btn.classList.add('djt-translated')
      return
    }

    const loadingBlock = createLoadingBlock()
    messageEl.appendChild(loadingBlock)
    btn.disabled = true

    try {
      const { translation, provider } = await this.requestTranslation(
        messageId,
        text,
        isInViewport(messageEl),
      )

      removeExistingBlock(messageEl)

      const entry = { translation, provider, timestamp: Date.now() }
      this.registry.set(messageId, hash, entry)

      const resultBlock = createResultBlock(translation, entry.provider)
      messageEl.setAttribute(DJT_HASH_ATTR, hash)
      messageEl.appendChild(resultBlock)

      btn.textContent = '✓ 非表示'
      btn.classList.add('djt-translated')
    } catch (err) {
      removeExistingBlock(messageEl)
      const errorBlock = document.createElement('div')
      errorBlock.className = 'djt-translation-block'
      errorBlock.setAttribute(DJT_BLOCK_ATTR, 'true')
      errorBlock.style.borderLeftColor = '#ed4245'
      errorBlock.textContent = '翻訳に失敗しました。もう一度お試しください。'
      messageEl.appendChild(errorBlock)
    } finally {
      btn.disabled = false
    }
  }

  private requestTranslation(
    id: string,
    text: string,
    inViewport: boolean,
  ): Promise<{ translation: string; provider: string }> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue({ id, text, isInViewport: inViewport, resolve, reject })
    })
  }

  cleanup(): void {
    document.querySelectorAll(`[${DJT_BTN_ATTR}]`).forEach((el) => el.remove())
    document.querySelectorAll(`[${DJT_BLOCK_ATTR}]`).forEach((el) => el.remove())
  }
}
