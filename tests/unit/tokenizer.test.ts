import { describe, expect, it } from 'vitest'
import { tokenize } from '../../src/content/extractor/tokenizer'

describe('tokenize', () => {
  it('returns plain text unchanged when there are no special tokens', () => {
    // Arrange
    const text = 'Hello world, this is plain text.'

    // Act
    const { translatable, restore } = tokenize(text)
    const restored = restore(translatable)

    // Assert
    expect(translatable).toBe(text)
    expect(restored).toBe(text)
  })

  it('replaces @user mention with placeholder and restores it after translation', () => {
    // Arrange
    const text = 'Hey <@123456789> check this out'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).not.toContain('<@123456789>')
    expect(translatable).toContain('<x id="0"/>')

    const fakeTranslation = translatable.replace('Hey', 'おい').replace('check this out', 'これを見て')
    const restored = restore(fakeTranslation)
    expect(restored).toContain('<@123456789>')
    expect(restored).not.toContain('<x id="0"/>')
  })

  it('replaces #channel mention with placeholder and restores it', () => {
    // Arrange
    const text = 'Go to <#987654321> for info'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).toContain('<x id="0"/>')
    expect(translatable).not.toContain('<#987654321>')

    const restored = restore(translatable)
    expect(restored).toContain('<#987654321>')
  })

  it('replaces custom emoji with placeholder and restores it', () => {
    // Arrange
    const text = 'Nice <:thumbsup:111222333> job!'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).toContain('<x id="0"/>')
    expect(translatable).not.toContain('<:thumbsup:111222333>')

    const restored = restore(translatable)
    expect(restored).toContain('<:thumbsup:111222333>')
  })

  it('replaces inline code with placeholder and restores it', () => {
    // Arrange
    const text = 'Run `npm install` to set up'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).not.toContain('`npm install`')
    expect(translatable).toContain('<x id="0"/>')

    const restored = restore(translatable)
    expect(restored).toContain('`npm install`')
  })

  it('replaces code block with placeholder and restores it', () => {
    // Arrange
    const text = 'Here is code:\n```\nconst x = 1\n```\n done'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).not.toContain('const x = 1')
    expect(translatable).toContain('<x id="0"/>')

    const restored = restore(translatable)
    expect(restored).toContain('const x = 1')
  })

  it('replaces URL with placeholder and restores it', () => {
    // Arrange
    const text = 'Check https://example.com/foo?bar=1 out'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).not.toContain('https://example.com')
    expect(translatable).toContain('<x id="0"/>')

    const restored = restore(translatable)
    expect(restored).toContain('https://example.com/foo?bar=1')
  })

  it('handles mixed content with multiple token types correctly', () => {
    // Arrange
    const text = 'Hey <@111>, see https://discord.com and run `git pull` <:wave:222>'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).not.toContain('<@111>')
    expect(translatable).not.toContain('https://discord.com')
    expect(translatable).not.toContain('`git pull`')
    expect(translatable).not.toContain('<:wave:222>')

    const restored = restore(translatable)
    expect(restored).toContain('<@111>')
    expect(restored).toContain('https://discord.com')
    expect(restored).toContain('`git pull`')
    expect(restored).toContain('<:wave:222>')
  })

  it('assigns sequential IDs to multiple placeholders', () => {
    // Arrange
    const text = '<@1> and <@2> both attend'

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).toContain('<x id="0"/>')
    expect(translatable).toContain('<x id="1"/>')

    const restored = restore(translatable)
    expect(restored).toContain('<@1>')
    expect(restored).toContain('<@2>')
  })

  it('returns original text from restore when no placeholders exist', () => {
    // Arrange
    const text = 'おはようございます'

    // Act
    const { translatable, restore } = tokenize(text)
    const restored = restore(translatable)

    // Assert
    expect(restored).toBe(text)
  })

  it('handles empty string without error', () => {
    // Arrange
    const text = ''

    // Act
    const { translatable, restore } = tokenize(text)

    // Assert
    expect(translatable).toBe('')
    expect(restore('')).toBe('')
  })
})
