import { SELECTORS } from './domSelectors'

type MessageCallback = (messageEl: Element) => void

export class MessageObserver {
  private observer: MutationObserver | null = null
  private readonly callback: MessageCallback

  constructor(callback: MessageCallback) {
    this.callback = callback
  }

  start(): void {
    this.processExistingMessages()

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          this.processNode(node)
        }
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
  }

  private processExistingMessages(): void {
    const messages = document.querySelectorAll(SELECTORS.messageItem)
    messages.forEach((msg) => this.callback(msg))
  }

  private processNode(node: Element): void {
    if (node.matches(SELECTORS.messageItem)) {
      this.callback(node)
      return
    }

    const messages = node.querySelectorAll(SELECTORS.messageItem)
    messages.forEach((msg) => this.callback(msg))
  }
}
