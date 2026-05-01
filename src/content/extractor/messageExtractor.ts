const IGNORED_SELECTORS = [
  '[class*="embed"]',
  '[class*="reaction"]',
  '[class*="attachment"]',
  '[class*="accessory"]',
  '[class*="buttons"]',
  '[data-role="button"]',
  'time',
  'img',
]

export function extractMessageText(messageEl: Element): string | null {
  const contentEl = messageEl.querySelector('[id^="message-content-"]')
  if (!contentEl) return null

  const clone = contentEl.cloneNode(true) as Element

  for (const selector of IGNORED_SELECTORS) {
    clone.querySelectorAll(selector).forEach((el) => el.remove())
  }

  const text = clone.textContent?.trim() ?? ''
  return text.length > 0 ? text : null
}

export function extractMessageRawContent(messageEl: Element): Element | null {
  return messageEl.querySelector('[id^="message-content-"]')
}
