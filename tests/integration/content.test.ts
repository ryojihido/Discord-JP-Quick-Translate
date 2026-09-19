// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { fakeChrome } from '../helpers/chrome'
import { TranslationQueue } from '../../src/content/queue/translationQueue'
import { TranslationRenderer } from '../../src/content/renderer/translationRenderer'
import { extractMessageParts } from '../../src/content/extractor/messageExtractor'
import { tokenize } from '../../src/content/extractor/tokenizer'
import { MessageObserver } from '../../src/content/observer/messageObserver'
import { ChannelObserver } from '../../src/content/observer/channelObserver'
let env: ReturnType<typeof fakeChrome>
beforeEach(()=>{
  env=fakeChrome()
  vi.stubGlobal('crypto',webcrypto)
  vi.useFakeTimers()
  document.body.innerHTML='<ol><li id="chat-messages-1-2"><div id="message-content-1-2">Hello <code>SECRET ``` code</code> world</div></li></ol>'
  env.chrome.runtime.sendMessage.mockImplementation((m,cb)=>cb({ok:true,data:{results:m.items.map((i:any)=>({id:i.id,translation:'訳:'+i.text,provider:'deepl'}))}}))
})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
const message=()=>document.querySelector('li')!
describe('real DOM extraction and rendering',()=>{
  it('keeps code, mentions and emoji local and excludes UI/attachments',()=>{
    document.querySelector('[id^="message-content"]')!.innerHTML='Use <pre><code>SECRET &lt;x&gt;</code></pre><span class="mention_x">@person</span><img class="emoji" alt=":wave:"><br>done<img alt="attachment"><span class="attachment_x">hidden</span><button>Copy</button>'
    const tokens=tokenize(extractMessageParts(message()))
    expect(tokens.texts).toEqual(['Use','done'])
    expect(tokens.restore(['使用','完了'])).toBe('使用 SECRET <x>@person:wave:\n完了')
  })
  it('reads edited text at click time, sends no code, and uses textContent for hostile results',async()=>{
    const q=new TranslationQueue(), renderer=new TranslationRenderer(q)
    renderer.injectButton(message())
    document.querySelector('[id^="message-content"]')!.firstChild!.textContent='Edited '
    env.chrome.runtime.sendMessage.mockImplementation((m,cb)=>cb({ok:true,data:{results:m.items.map((i:any)=>({id:i.id,translation:'<img src=x onerror=alert(1)>',provider:'deepl'}))}}))
    const button=document.querySelector('button')!
    const done=(renderer as any).handleButtonClick(message(),button)
    await vi.advanceTimersByTimeAsync(250);await done
    const sent=JSON.stringify(env.chrome.runtime.sendMessage.mock.calls)
    expect(sent).toContain('Edited')
    expect(sent).not.toContain('SECRET')
    expect(sent).not.toContain('Hello')
    expect(document.querySelector('[data-djt-block] img')).toBeNull()
    expect(document.querySelector('[data-djt-block]')!.textContent).toContain('SECRET')
    await (renderer as any).handleButtonClick(message(),button)
    expect((document.querySelector('[data-djt-block]') as HTMLElement).hidden).toBe(true)
    await (renderer as any).handleButtonClick(message(),button)
    expect((document.querySelector('[data-djt-block]') as HTMLElement).hidden).toBe(false)
    expect(env.chrome.runtime.sendMessage).toHaveBeenCalledOnce()
  })
  it('rejects page-script synthetic clicks',async()=>{
    const renderer=new TranslationRenderer(new TranslationQueue())
    renderer.injectButton(message())
    document.querySelector('button')!.click()
    await vi.advanceTimersByTimeAsync(500)
    expect(env.chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
  it('shows failure, restores the button, and really retries',async()=>{
    const renderer=new TranslationRenderer(new TranslationQueue())
    renderer.injectButton(message())
    env.chrome.runtime.sendMessage.mockImplementationOnce((_m,cb)=>cb({ok:false,error:'認証エラー'}))
    const button=document.querySelector('button')!
    let done=(renderer as any).handleButtonClick(message(),button)
    await vi.advanceTimersByTimeAsync(250);await done
    expect(button.disabled).toBe(false)
    expect(document.querySelector('[data-djt-block]')!.textContent).toBe('認証エラー')
    done=(renderer as any).handleButtonClick(message(),button)
    await vi.advanceTimersByTimeAsync(250);await done
    expect(env.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-djt-block]')!.getAttribute('data-success')).toBe('true')
  })
  it('discards late results after cleanup, edits or a removed message',async()=>{
    for(const action of ['cleanup','edit','remove']){
      document.body.innerHTML='<li id="chat-messages-1-2"><div id="message-content-1-2">Hello</div></li>'
      const renderer=new TranslationRenderer(new TranslationQueue())
      renderer.injectButton(message())
      let reply:any
      env.chrome.runtime.sendMessage.mockImplementation((_m,cb)=>{reply=cb})
      const button=document.querySelector('button')!
      const done=(renderer as any).handleButtonClick(message(),button)
      await vi.advanceTimersByTimeAsync(250)
      if(action==='cleanup')renderer.cleanup()
      if(action==='edit')document.querySelector('[id^="message-content"]')!.textContent='Changed'
      if(action==='remove')message().remove()
      const m=env.chrome.runtime.sendMessage.mock.lastCall![0]
      reply({ok:true,data:{results:m.items.map((i:any)=>({id:i.id,translation:'late',provider:'deepl'}))}})
      await vi.advanceTimersByTimeAsync(1);await done
      expect(document.querySelector('[data-djt-block]')).toBeNull()
    }
  })
  it('does not send code-only or oversized messages',async()=>{
    const renderer=new TranslationRenderer(new TranslationQueue())
    renderer.injectButton(message())
    const button=document.querySelector('button')!
    document.querySelector('[id^="message-content"]')!.innerHTML='<code>SECRET</code>'
    await (renderer as any).handleButtonClick(message(),button)
    expect(document.querySelector('[data-djt-block]')!.textContent).toContain('文章がありません')
    document.querySelector('[id^="message-content"]')!.textContent='x'.repeat(8001)
    await (renderer as any).handleButtonClick(message(),button)
    expect(document.querySelector('[data-djt-block]')!.textContent).toContain('長すぎ')
    expect(env.chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})
describe('observer lifecycle and synced OFF',()=>{
  it('starts each observer once and stops all navigation callbacks',async()=>{
    const change=vi.fn(), channel=new ChannelObserver(change)
    channel.start();channel.start()
    history.pushState({},'', '/channels/a')
    await vi.advanceTimersByTimeAsync(250)
    expect(change).toHaveBeenCalledOnce()
    channel.stop()
    history.pushState({},'', '/channels/b')
    await vi.advanceTimersByTimeAsync(500)
    expect(change).toHaveBeenCalledOnce()
    const seen=vi.fn(), observer=new MessageObserver(seen)
    observer.start();observer.start()
    expect(seen).toHaveBeenCalledOnce()
    const container=document.createElement('div')
    container.innerHTML='<li id="chat-messages-a-b"><div id="message-content-a-b">new</div></li>'
    document.body.append(container)
    await Promise.resolve()
    expect(seen).toHaveBeenCalledTimes(2)
    observer.stop()
    document.body.append(document.createElement('li'))
    await Promise.resolve()
    expect(seen).toHaveBeenCalledTimes(2)
  })
  it('honors shared OFF through navigation, ON, settings changes and cache clear',async()=>{
    vi.resetModules()
    await import('../../src/content/index')
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('[data-djt-btn]')).not.toBeNull()
    await env.chrome.storage.sync.set({enabled:false})
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('[data-djt-btn]')).toBeNull()
    history.pushState({},'', '/channels/off')
    document.title='changed'
    await vi.advanceTimersByTimeAsync(500)
    expect(document.querySelector('[data-djt-btn]')).toBeNull()
    await env.chrome.storage.sync.set({enabled:true})
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelectorAll('[data-djt-btn]')).toHaveLength(1)
    document.querySelector('li')!.insertAdjacentHTML('beforeend','<div data-djt-block="true">old</div>')
    await env.chrome.storage.sync.set({cacheRevision:'changed'})
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('[data-djt-block]')).toBeNull()
    history.pushState({},'', '/channels/on')
    await vi.advanceTimersByTimeAsync(250)
    expect(document.querySelectorAll('[data-djt-btn]')).toHaveLength(1)
    await env.chrome.storage.sync.set({targetLang:'EN'})
    await vi.advanceTimersByTimeAsync(1)
    env.chrome.storage.sync.get.mockRejectedValueOnce(new Error('denied'))
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    await env.chrome.storage.sync.set({enabled:false})
    await vi.advanceTimersByTimeAsync(1)
    expect(document.querySelector('[data-djt-btn]')).toBeNull()
    expect(log).toHaveBeenCalled()
  })
})
