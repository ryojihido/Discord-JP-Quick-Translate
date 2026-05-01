import { MessageObserver } from './observer/messageObserver'
import { ChannelObserver } from './observer/channelObserver'
import { TranslationQueue } from './queue/translationQueue'
import { MessageRegistry } from './state/messageRegistry'
import { TranslationRenderer } from './renderer/translationRenderer'

const queue = new TranslationQueue()
const registry = new MessageRegistry()
const renderer = new TranslationRenderer(queue, registry)

const messageObserver = new MessageObserver((messageEl) => {
  renderer.injectButton(messageEl)
})

const channelObserver = new ChannelObserver((_newPath) => {
  registry.clear()
  renderer.cleanup()
  messageObserver.stop()
  messageObserver.start()
})

chrome.storage.sync.get(['enabled'], (result) => {
  const isEnabled = result.enabled !== false

  if (isEnabled) {
    messageObserver.start()
    channelObserver.start()
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_EXTENSION') {
    if (message.enabled) {
      messageObserver.start()
      channelObserver.start()
    } else {
      messageObserver.stop()
      renderer.cleanup()
    }
  }
})
