import { vi } from 'vitest'
export function fakeChrome() {
  const local: Record<string, unknown> = {}
  const sync: Record<string, unknown> = {}
  const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = []
  const messages: Array<(message: unknown, sender: any, reply: (r: unknown) => void) => void> = []
  const area = (data: Record<string, unknown>, name: string) => ({
    get: vi.fn(async (_keys?: unknown) => structuredClone(data)),
    set: vi.fn(async (values: Record<string, unknown>) => {
      const changes: Record<string, unknown> = {}
      for (const [key, newValue] of Object.entries(values)) {
        const oldValue = data[key]
        data[key] = newValue
        if (oldValue !== newValue) changes[key] = { oldValue, newValue }
      }
      for (const listener of listeners) listener(changes, name)
    }),
    setAccessLevel: vi.fn(async () => {}),
  })
  const chrome = {
    runtime: { id: 'test-extension', getURL: (path: string) => 'chrome-extension://test-extension/' + path,
      lastError: undefined as undefined | { message: string }, sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn((fn) => messages.push(fn)) } },
    storage: { local: area(local, 'local'), sync: area(sync, 'sync'),
      onChanged: { addListener: vi.fn((fn) => listeners.push(fn)) } },
  }
  vi.stubGlobal('chrome', chrome)
  return { chrome, local, sync, listeners, messages }
}
export const optionsSender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/options/options.html' }
export const discordSender = { id: 'test-extension', url: 'https://discord.com/channels/1/2', frameId: 0, tab: { id: 1 } }
export const popupSender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/popup/popup.html' }
