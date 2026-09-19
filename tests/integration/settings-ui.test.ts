// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeChrome } from '../helpers/chrome'
let root: import('react-dom/client').Root
vi.mock('react-dom/client', async (original) => {
  const real = await original<typeof import('react-dom/client')>()
  return { ...real, createRoot: (...args: Parameters<typeof real.createRoot>) => { root = real.createRoot(...args); return root } }
})
let env: ReturnType<typeof fakeChrome>
beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  env = fakeChrome()
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(async () => { if (root) await act(() => root.unmount()); vi.unstubAllGlobals() })
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(label))!
describe('settings and popup UI with real React rendering', () => {
  it('does not overwrite keys before load, or show saved after a failed write', async () => {
    let load: any
    env.chrome.runtime.sendMessage.mockImplementation((m, cb) => {
      if (m.type === 'GET_CONFIG') load = cb
      else cb({ ok: false, error: '保存に失敗しました' })
    })
    await act(async () => { await import('../../src/options/options') })
    expect(button('設定を保存').disabled).toBe(true)
    await act(() => load({ ok: true, data: { targetLang: 'JA', preferredProvider: 'deepl', deeplKey: 'dummy', googleKey: '' } }))
    expect((document.querySelector('input[type=password]') as HTMLInputElement).value).toBe('dummy')
    await act(() => button('設定を保存').click())
    expect(document.querySelector('[role=alert]')!.textContent).toContain('保存に失敗')
    expect(document.body.textContent).not.toContain('保存しました')
    expect(button('設定を保存').disabled).toBe(false)
    await act(() => button('キャッシュをクリア').click())
    expect(document.body.textContent).not.toContain('0 件のキャッシュ')
  })
  it('reports confirmed save, test and cache clear results', async () => {
    env.chrome.runtime.sendMessage.mockImplementation((m, cb) => cb({ ok: true, data: m.type === 'GET_CONFIG' ? { targetLang:'JA',preferredProvider:'deepl',deeplKey:'dummy',googleKey:'' } : {success:true} }))
    await act(async () => { await import('../../src/options/options') })
    await act(() => button('設定を保存').click())
    expect(document.body.textContent).toContain('保存しました')
    await act(() => button('テスト').click())
    expect(document.body.textContent).toContain('接続成功')
    await act(() => button('キャッシュをクリア').click())
    expect(document.body.textContent).toContain('0 件のキャッシュ')
  })
  it('keeps settings unsavable after a load error', async () => {
    env.chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb({ok:false,error:'読取り失敗'}))
    await act(async () => { await import('../../src/options/options') })
    expect(button('設定を保存').disabled).toBe(true)
    expect(document.querySelector('[role=alert]')!.textContent).toBe('読取り失敗')
  })
  it('updates shared enabled state and does not pretend a failed toggle succeeded', async () => {
    env.chrome.runtime.sendMessage.mockImplementation((_m, cb) => cb({ok:true,data:{deepl:{chars:10,month:202609},google:{chars:0,month:202609}}}))
    await act(async () => { await import('../../src/popup/popup') })
    const toggle=document.querySelector('input[type=checkbox]') as HTMLInputElement
    await act(() => toggle.click())
    expect(env.sync.enabled).toBe(false)
    expect(toggle.checked).toBe(false)
    env.chrome.storage.sync.set.mockRejectedValueOnce(new Error('disk failure'))
    await act(() => toggle.click())
    expect(toggle.checked).toBe(false)
    expect(document.querySelector('[role=alert]')!.textContent).toContain('失敗')
    expect(document.body.textContent).toContain('推定使用量')
  })
})
