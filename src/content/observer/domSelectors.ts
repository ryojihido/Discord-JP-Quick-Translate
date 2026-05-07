export const SELECTORS = {
  messageList: '[data-list-id="chat-messages"]',
  messageItem: 'li[id^="chat-messages-"]',
  messageContent: '[id^="message-content-"]',
  channelHeader: 'h1[class*="title"]',
} as const

const REPLY_CONTEXT_SELECTORS = [
  '[id^="message-reply-context-"]',
  '[class*="repliedMessage"]',
  '[class*="replyingTo"]',
]

export function getMessageId(messageEl: Element): string | null {
  const id = messageEl.id
  const parts = id.split('-')
  return parts.length >= 3 ? parts[parts.length - 1] : null
}

function isInsideReplyContext(el: Element, messageEl: Element): boolean {
  let current: Element | null = el

  while (current && current !== messageEl) {
    if (REPLY_CONTEXT_SELECTORS.some((selector) => current?.matches(selector))) {
      return true
    }

    current = current.parentElement
  }

  return false
}

export function getMessageContent(messageEl: Element): Element | null {
  const candidates = Array.from(messageEl.querySelectorAll(SELECTORS.messageContent))
  if (candidates.length === 0) return null

  const nonReplyCandidates = candidates.filter((candidate) => !isInsideReplyContext(candidate, messageEl))
  const messageId = getMessageId(messageEl)

  if (messageId) {
    const ownCandidate = nonReplyCandidates.find((candidate) => candidate.id.endsWith(`-${messageId}`))
    if (ownCandidate) return ownCandidate
  }

  return nonReplyCandidates[nonReplyCandidates.length - 1] ?? null
}
