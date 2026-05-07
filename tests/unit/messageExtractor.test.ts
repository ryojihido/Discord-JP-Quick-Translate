// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractMessageRawContent, extractMessageText } from '../../src/content/extractor/messageExtractor'

function createMessage(html: string): Element {
  const wrapper = document.createElement('ol')
  wrapper.innerHTML = html.trim()
  const message = wrapper.firstElementChild
  if (!message) throw new Error('Missing message fixture')
  return message
}

describe('extractMessageText', () => {
  it('extracts the current message instead of the replied-to preview', () => {
    const message = createMessage(`
      <li id="chat-messages-111-222">
        <div id="message-reply-context-111-999">
          <span class="repliedMessage_abc">
            <span id="message-content-111-999">@Hello what did u write</span>
          </span>
        </div>
        <div>
          <div id="message-content-111-222">
            You are a direct, capable, and honest assistant.
          </div>
        </div>
      </li>
    `)

    expect(extractMessageText(message)).toBe('You are a direct, capable, and honest assistant.')
  })

  it('uses the last non-reply content when the list item id is unavailable', () => {
    const message = createMessage(`
      <li>
        <div id="message-reply-context-111-999">
          <span id="message-content-111-999">quoted message</span>
        </div>
        <div id="message-content-111-222">actual message</div>
      </li>
    `)

    expect(extractMessageText(message)).toBe('actual message')
    expect(extractMessageRawContent(message)?.id).toBe('message-content-111-222')
  })

  it('returns null when only a reply preview is present', () => {
    const message = createMessage(`
      <li id="chat-messages-111-222">
        <div class="repliedMessage_abc">
          <span id="message-content-111-999">quoted message</span>
        </div>
      </li>
    `)

    expect(extractMessageText(message)).toBeNull()
  })
})
