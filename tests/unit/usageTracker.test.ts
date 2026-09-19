import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fakeChrome } from '../helpers/chrome'
let env: ReturnType<typeof fakeChrome>
beforeEach(()=>{vi.resetModules();env=fakeChrome()})
afterEach(()=>vi.unstubAllGlobals())
describe('real usage tracker',()=>{
  it('serializes concurrent increments without lost updates',async()=>{
    const {trackUsage,getUsageStats}=await import('../../src/background/usage/usageTracker')
    await Promise.all([trackUsage('deepl',10),trackUsage('deepl',20),trackUsage('google',7)])
    expect(await getUsageStats()).toMatchObject({deepl:{chars:30},google:{chars:7}})
  })
  it('starts a new month and rejects invalid input/data',async()=>{
    const {trackUsage,getUsageStats}=await import('../../src/background/usage/usageTracker')
    env.local.usage_deepl={chars:100,month:202001}
    expect(await trackUsage('deepl',2)).toMatchObject({chars:2})
    await expect(trackUsage('deepl',-1)).rejects.toThrow()
    env.local.usage_google={chars:'bad',month:202609}
    await expect(getUsageStats()).rejects.toThrow()
  })
  it('surfaces write errors and releases the lock for the next operation',async()=>{
    const {trackUsage}=await import('../../src/background/usage/usageTracker')
    env.chrome.storage.local.set.mockRejectedValueOnce(new Error('write denied'))
    await expect(trackUsage('deepl',10)).rejects.toThrow('write denied')
    expect(await trackUsage('deepl',20)).toMatchObject({chars:20})
  })
})
