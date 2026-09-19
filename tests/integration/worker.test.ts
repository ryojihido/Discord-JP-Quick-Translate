import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { fakeChrome, optionsSender, discordSender, popupSender } from '../helpers/chrome'
let env: ReturnType<typeof fakeChrome>
let handle: typeof import('../../src/background/serviceWorker').handleMessage
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.resetModules()
  env = fakeChrome()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  fetchMock = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body)
    const texts = body.text ?? body.q
    return new Response(JSON.stringify(body.text ? { translations: texts.map((t: string) => ({ text: '訳:' + t })) } :
      { data: { translations: texts.map((t: string) => ({ translatedText: '訳:' + t })) } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  handle = (await import('../../src/background/serviceWorker')).handleMessage
  await handle({ type: 'GET_CONFIG' }, optionsSender)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const request = (text = 'Hello') => ({ type: 'TRANSLATE_BATCH', items: [{ id: '1', text }] })
describe('real worker security and translation path', () => {
  it('restricts local storage before accessing keys', () => {
    expect(env.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' })
    expect(env.chrome.storage.local.setAccessLevel.mock.invocationCallOrder[0]).toBeLessThan(env.chrome.storage.local.get.mock.invocationCallOrder[0])
  })
  it.each(['GET_CONFIG','GET_API_KEY','SET_API_KEY','SAVE_SETTINGS','CLEAR_CACHE','TEST_API','GET_USAGE'])('denies %s to content scripts without reading keys', async type => {
    env.local.deeplKey = 'dummy-private'
    const count = env.chrome.storage.local.get.mock.calls.length
    await expect(handle({ type, provider: 'deepl', key: 'dummy' }, discordSender)).rejects.toThrow()
    expect(env.chrome.storage.local.get.mock.calls.length).toBe(count)
    expect(env.local.deeplKey).toBe('dummy-private')
  })
  it.each([
    { ...discordSender, id: 'other-extension' }, { ...discordSender, frameId: 1 },
    { ...discordSender, tab: undefined }, { ...discordSender, url: 'https://discord.com.attacker.invalid/channels/1' },
    { ...discordSender, url: 'http://discord.com/channels/1' }, { ...discordSender, url: undefined },
  ])('denies invalid translation senders before network: %j', async sender => {
    await expect(handle(request(), sender)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([null, {}, { type: 'UNKNOWN' }, { type:'TRANSLATE_BATCH', items: [] },
    { type:'TRANSLATE_BATCH', items:[{id:'1',text:3}] }, { type:'TRANSLATE_BATCH', items:[{id:'1',text:' '}] },
    { type:'TRANSLATE_BATCH', items:[{id:'1',text:'x'},{id:'1',text:'y'}] },
    { type:'TRANSLATE_BATCH', items:[{id:'1',text:'x'.repeat(8001)}] },
    { type:'TRANSLATE_BATCH', items: Array.from({length:21},(_,i)=>({id:String(i),text:'x'})) },
    { type:'TRANSLATE_BATCH', items: Array.from({length:3},(_,i)=>({id:String(i),text:'x'.repeat(8000)})) },
  ])('rejects malformed input without API use %#', async input => {
    await expect(handle(input, discordSender)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('saves keys only through options, trims and restores them, with explicit validation', async () => {
    await handle({ type:'SAVE_SETTINGS', settings:{targetLang:'EN',preferredProvider:'google'}, deeplKey:' dummy ',googleKey:'google-dummy' }, optionsSender)
    expect(await handle({ type:'GET_CONFIG' }, optionsSender)).toMatchObject({deeplKey:'dummy',googleKey:'google-dummy',targetLang:'EN',preferredProvider:'google'})
    for (const value of [null,'x'.repeat(513),'a\nb']) {
      await expect(handle({type:'SAVE_SETTINGS',settings:{},deeplKey:value,googleKey:''},optionsSender)).rejects.toThrow()
    }
    await expect(handle({type:'SAVE_SETTINGS',settings:null},optionsSender)).rejects.toThrow()
    await expect(handle({type:'SAVE_SETTINGS',settings:{preferredProvider:'other'},deeplKey:'',googleKey:''},optionsSender)).rejects.toThrow()
    await expect(handle({type:'UNKNOWN'},optionsSender)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('propagates storage failures instead of claiming success', async () => {
    env.chrome.storage.local.set.mockRejectedValueOnce(new Error('disk failure private-value'))
    await expect(handle({type:'SAVE_SETTINGS',settings:{},deeplKey:'dummy',googleKey:''}, optionsSender)).rejects.toThrow()
    expect(env.sync.settingsRevision).toBeUndefined()
  })
  it('translates, tracks usage, caches by selected language/provider and clears', async () => {
    env.local.deeplKey = 'dummy'
    expect(await handle(request(),discordSender)).toEqual({results:[{id:'1',translation:'訳:Hello',provider:'deepl'}]})
    await handle(request(),discordSender)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(await handle({type:'GET_USAGE'},popupSender)).toMatchObject({deepl:{chars:5}})
    await env.chrome.storage.sync.set({targetLang:'EN'})
    await handle(request(),discordSender)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    env.local.googleKey='dummy'
    await env.chrome.storage.sync.set({preferredProvider:'google'})
    await handle(request(),discordSender)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toContain('googleapis')
    await handle({type:'CLEAR_CACHE'},optionsSender)
    expect(env.sync.cacheRevision).toBeTypeOf('string')
    await handle(request(),discordSender)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
  it('rejects disabled or invalid saved settings before network', async () => {
    env.sync.enabled=false
    await expect(handle(request(),discordSender)).rejects.toThrow('オフ')
    env.sync.enabled=true
    env.sync.targetLang='INVALID'
    await expect(handle(request(),discordSender)).rejects.toThrow('設定')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('tests keys through the same provider path and counts the test text', async () => {
    await handle({type:'TEST_API',provider:'google',key:'dummy'},optionsSender)
    expect(await handle({type:'GET_USAGE'},optionsSender)).toMatchObject({google:{chars:5}})
    await expect(handle({type:'TEST_API',provider:'unknown',key:'dummy'},optionsSender)).rejects.toThrow()
  })
  it('returns a sanitized failure envelope for runtime listeners', async () => {
    env.chrome.storage.local.get.mockRejectedValueOnce(new Error('private-value'))
    const response = await new Promise(resolve => env.messages[0]({type:'GET_CONFIG'},optionsSender,resolve))
    expect(response).toMatchObject({ok:false})
    expect(JSON.stringify(response)).not.toContain('private-value')
    const success = await new Promise(resolve => env.messages[0]({type:'GET_USAGE'},popupSender,resolve))
    expect(success).toMatchObject({ok:true})
  })
  it('aborts active HTTP on OFF and never resurrects cleared cache', async () => {
    env.local.deeplKey='dummy'
    let finish!: () => void
    fetchMock.mockImplementation((_url, init) => new Promise(resolve => {
      finish=()=>resolve(new Response(JSON.stringify({translations:[{text:'late'}]})))
      // Deliberately allow a late network completion to exercise the generation check.
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }))
    const pending = handle(request(),discordSender)
    const assertion = expect(pending).rejects.toThrow('中止')
    await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledOnce())
    await handle({type:'CLEAR_CACHE'},optionsSender)
    await env.chrome.storage.sync.set({enabled:false})
    finish()
    await assertion
    await env.chrome.storage.sync.set({enabled:true})
    fetchMock.mockResolvedValue(new Response(JSON.stringify({translations:[{text:'fresh'}]})))
    expect(await handle(request(),discordSender)).toMatchObject({results:[{translation:'fresh'}]})
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('bounds concurrent HTTP requests', async () => {
    env.local.deeplKey='dummy'
    const finishes: Array<()=>void>=[]
    fetchMock.mockImplementation(()=>new Promise(resolve=>finishes.push(()=>resolve(new Response(JSON.stringify({translations:[{text:'訳'}]}))))))
    const a=handle(request('one'),discordSender), b=handle(request('two'),discordSender)
    await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2))
    await expect(handle(request('three'),discordSender)).rejects.toThrow('集中')
    finishes.forEach(f=>f())
    await Promise.all([a,b])
  })
  it('fails closed if local access restriction cannot be applied', async () => {
    vi.resetModules()
    env=fakeChrome()
    env.chrome.storage.local.setAccessLevel.mockRejectedValueOnce(new Error('denied'))
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    const failed=(await import('../../src/background/serviceWorker')).handleMessage
    await expect(failed({type:'GET_CONFIG'},optionsSender)).rejects.toThrow()
    expect(env.chrome.storage.local.get).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
  })
})
