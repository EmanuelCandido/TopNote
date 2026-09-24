import type { NotePatch, SaveStatus } from '../types'

export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: NotePatch | null = null
  private inFlight: Promise<boolean> | null = null
  private revision = 0
  private savedRevision = 0

  constructor(
    private readonly save: (patch: NotePatch) => Promise<unknown>,
    private readonly onStatus: (status: SaveStatus) => void,
    private readonly onError: (error: unknown) => void,
    private readonly delay = 550,
  ) {}

  schedule(patch: NotePatch) {
    this.pending = patch
    this.revision++
    this.onStatus('saving')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, this.delay)
  }

  async flush(): Promise<boolean> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.inFlight) return this.inFlight
    this.inFlight = this.drainPending().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async drainPending(): Promise<boolean> {
    while (this.pending && this.savedRevision < this.revision) {
      const patch = this.pending
      const revision = this.revision
      try {
        await this.save(patch)
        this.savedRevision = revision
        if (this.revision === revision) {
          this.pending = null
          this.onStatus('saved')
        }
      } catch (error) {
        this.onStatus('error')
        this.onError(error)
        return false
      }
    }
    return true
  }

  hasPending() { return this.pending !== null }
  dispose() { if (this.timer) clearTimeout(this.timer) }
}
