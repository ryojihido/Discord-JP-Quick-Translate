import { getMessageContent } from '../observer/domSelectors'
export interface MessagePart { readonly text: string; readonly protected: boolean }
const IGNORED = '[class*="embed"],[class*="reaction"],[class*="attachment"],[class*="accessory"],[class*="buttons"],[data-role="button"],button,time'
export function extractMessageParts(messageEl: Element): MessagePart[] {
  const content = getMessageContent(messageEl)
  if (!content) return []
  const parts: MessagePart[] = []
  const add = (text: string, protectedText: boolean) => {
    const last = parts[parts.length - 1]
    if (last && last.protected === protectedText) parts[parts.length - 1] = { text: last.text + text, protected: protectedText }
    else parts.push({ text, protected: protectedText })
  }
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) { add(node.textContent ?? '', false); return }
    if (!(node instanceof Element) || node.matches(IGNORED)) return
    if (node.matches('pre,code,[class*="mention"]')) {
      add(node.textContent ?? '', true)
    } else if (node.matches('img')) {
      if (node.matches('[class*="emoji"]')) add(node.getAttribute('alt') ?? '', true)
    } else if (node.matches('br')) add('\n', false)
    else node.childNodes.forEach(visit)
  }
  content.childNodes.forEach(visit)
  return parts
}
export function extractMessageText(messageEl: Element): string | null {
  const text = extractMessageParts(messageEl).map(p => p.text).join('').trim()
  return text || null
}
export function extractMessageRawContent(messageEl: Element): Element | null {
  return getMessageContent(messageEl)
}
