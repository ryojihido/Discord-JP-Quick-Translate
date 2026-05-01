type ChannelChangeCallback = (newPath: string) => void

export class ChannelObserver {
  private lastPath: string = location.pathname
  private titleObserver: MutationObserver | null = null
  private readonly callback: ChannelChangeCallback

  constructor(callback: ChannelChangeCallback) {
    this.callback = callback
  }

  start(): void {
    this.interceptNavigationEvents()
    this.watchTitleChanges()
  }

  stop(): void {
    this.titleObserver?.disconnect()
    this.titleObserver = null
  }

  private interceptNavigationEvents(): void {
    const originalPushState = history.pushState.bind(history)
    const originalReplaceState = history.replaceState.bind(history)

    history.pushState = (...args) => {
      originalPushState(...args)
      this.onPathChange()
    }

    history.replaceState = (...args) => {
      originalReplaceState(...args)
      this.onPathChange()
    }

    window.addEventListener('popstate', () => this.onPathChange())
  }

  private watchTitleChanges(): void {
    const titleEl = document.querySelector('title')
    if (!titleEl) return

    this.titleObserver = new MutationObserver(() => {
      this.onPathChange()
    })

    this.titleObserver.observe(titleEl, { childList: true })
  }

  private onPathChange(): void {
    const currentPath = location.pathname
    if (currentPath === this.lastPath) return
    this.lastPath = currentPath
    this.callback(currentPath)
  }
}
