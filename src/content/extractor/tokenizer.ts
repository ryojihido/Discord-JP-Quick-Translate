export type TokenType = 'text' | 'mention' | 'emoji' | 'code' | 'url'

export interface Token {
  readonly type: TokenType
  readonly raw: string
}

export interface TokenizeResult {
  readonly translatable: string
  readonly restore: (translated: string) => string
}

const PATTERNS: ReadonlyArray<{ type: TokenType; regex: RegExp }> = [
  { type: 'code', regex: /```[\s\S]*?```|`[^`]+`/g },
  { type: 'url', regex: /https?:\/\/[^\s<>)]+/g },
  { type: 'mention', regex: /<@[!&]?\d+>|<#\d+>/g },
  { type: 'emoji', regex: /<a?:[a-zA-Z0-9_]+:\d+>|[\u{1F300}-\u{1FAFF}]/gu },
]

export function tokenize(text: string): TokenizeResult {
  const placeholders: string[] = []
  let working = text

  for (const { regex } of PATTERNS) {
    working = working.replace(regex, (match) => {
      const id = placeholders.length
      placeholders.push(match)
      return `<x id="${id}"/>`
    })
  }

  const translatable = working

  const restore = (translated: string): string => {
    return translated.replace(/<x id="(\d+)"\/>/g, (_, idStr) => {
      const id = parseInt(idStr, 10)
      return placeholders[id] ?? `<x id="${idStr}"/>`
    })
  }

  return { translatable, restore }
}
