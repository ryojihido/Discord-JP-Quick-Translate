export const SELECTORS = {
  messageList: '[data-list-id="chat-messages"]',
  messageItem: 'li[id^="chat-messages-"]',
  messageContent: '[id^="message-content-"]',
  channelHeader: 'h1[class*="title"]',
} as const

export function getMessageId(messageEl: Element): string | null {
  const id = messageEl.id
  const parts = id.split('-')
  return parts.length >= 3 ? parts[parts.length - 1] : null
}

export function getMessageContent(messageEl: Element): Element | null {
  return messageEl.querySelector(SELECTORS.messageContent)
}
