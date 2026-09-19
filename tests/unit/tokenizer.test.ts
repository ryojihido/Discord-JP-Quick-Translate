import { describe, expect, it } from 'vitest'
import { tokenize } from '../../src/content/extractor/tokenizer'
describe('actual tokenizer', () => {
  it.each([
    'Hello world', 'Hey <@123> and <#456>', 'Use `npm install` please',
    'Code:\n```js\nconst x = 1\n```\nDone', 'See https://example.com/x?y=1 now',
    'Hi <:wave:123> 😀👩‍💻! 🇯🇵 ❤️ 1️⃣ 👍🏽', ' <x id="0"/> & other HTML ', '', '\n  ',
  ])('round trips protected text and whitespace: %s', text => {
    const tokens = tokenize(text)
    expect(tokens.restore(tokens.texts)).toBe(text)
  })
  it('never sends DOM-protected code even with embedded backticks', () => {
    const tokens = tokenize([{ text: 'Run ', protected: false }, { text: '```SECRET```', protected: true }, { text: ' now', protected: false }])
    expect(tokens.texts).toEqual(['Run', 'now'])
    expect(tokens.restore(['実行', '今'])).toBe('実行 ```SECRET``` 今')
  })
  it('rejects missing and empty translated segments', () => {
    const tokens = tokenize('one `code` two')
    expect(() => tokens.restore(['一'])).toThrow()
    expect(() => tokens.restore(['一', ''])).toThrow()
  })
})
