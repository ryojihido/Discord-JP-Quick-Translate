type ChannelChangeCallback = (newPath: string) => void
export class ChannelObserver {
  private lastPath = location.pathname
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(private readonly callback: ChannelChangeCallback) {}
  // Content scripts run in an isolated world; patching history here cannot observe page-world pushState.
  start(): void {
    if (this.timer !== null) return
    this.lastPath = location.pathname
    this.timer = setInterval(() => {
      if (location.pathname !== this.lastPath) {
        this.lastPath = location.pathname
        this.callback(this.lastPath)
      }
    }, 250)
  }
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
