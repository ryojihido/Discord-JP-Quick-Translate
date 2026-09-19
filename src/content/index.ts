import { MessageObserver } from './observer/messageObserver'
import { ChannelObserver } from './observer/channelObserver'
import { TranslationQueue } from './queue/translationQueue'
import { TranslationRenderer } from './renderer/translationRenderer'
import { readSettings } from '../shared/protocol'
const renderer = new TranslationRenderer(new TranslationQueue())
const messages = new MessageObserver(el => renderer.injectButton(el))
let enabled = false
const channels = new ChannelObserver(() => {
  messages.stop()
  renderer.cleanup()
  if (enabled) messages.start()
})
function apply(value: Record<string, unknown>): void {
  messages.stop()
  channels.stop()
  renderer.cleanup()
  enabled = readSettings(value).enabled
  if (enabled) { messages.start(); channels.start() }
}
let revision = 0
async function refresh(): Promise<void> {
  const current = ++revision
  try {
    const value = await chrome.storage.sync.get(['enabled', 'targetLang', 'preferredProvider'])
    if (revision === current) apply(value)
  } catch {
    if (revision !== current) return
    enabled = false
    messages.stop()
    channels.stop()
    renderer.cleanup()
    console.error('[DJT] Settings could not be read. Translation is disabled.')
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ['enabled', 'targetLang', 'preferredProvider', 'cacheRevision', 'settingsRevision'].some(k => k in changes)) void refresh()
})
void refresh()
