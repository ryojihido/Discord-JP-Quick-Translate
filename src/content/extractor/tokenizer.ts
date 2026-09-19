import type { MessagePart } from './messageExtractor'
import { AppError } from '../../shared/protocol'
// Keep protected values on the page; no provider-generated placeholders are trusted.
const SPECIAL = /```[\s\S]*?```|`[^`]+`|https?:\/\/[^\s<>)]+|<@[!&]?\d+>|<#\d+>|<a?:[a-zA-Z0-9_]+:\d+>|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu
export function tokenize(input: string | ReadonlyArray<MessagePart>) {
  const parts: MessagePart[] = []
  for (const part of typeof input === 'string' ? [{ text: input, protected: false }] : input) {
    if (part.protected) { parts.push(part); continue }
    let offset = 0
    for (const match of part.text.matchAll(SPECIAL)) {
      if (match.index > offset) parts.push({ text: part.text.slice(offset, match.index), protected: false })
      parts.push({ text: match[0], protected: true })
      offset = match.index + match[0].length
    }
    if (offset < part.text.length) parts.push({ text: part.text.slice(offset), protected: false })
  }
  const texts = parts.filter(p => !p.protected && p.text.trim()).map(p => p.text.trim())
  return {
    texts,
    restore(translations: ReadonlyArray<string>): string {
      if (translations.length !== texts.length || translations.some(t => typeof t !== 'string' || !t.trim())) throw new AppError('翻訳結果の件数または形式が不正です。')
      let index = 0
      return parts.map(p => p.protected || !p.text.trim() ? p.text :
        p.text.match(/^\s*/)![0] + translations[index++] + p.text.match(/\s*$/)![0]).join('')
    },
  }
}
