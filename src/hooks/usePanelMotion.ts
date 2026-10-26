import { useRef } from 'react'

export type Anchor = [number, number, number, number]

// One curve each way, fast off the mark and soft at the end, so a motion never seems to pause.
const growing = { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)' }
const folding = { duration: 200, easing: 'cubic-bezier(.4, 0, .7, .2)' }
const radius = 20

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

/**
 * The editor window opens at its final size and never animates its bounds. The opaque panel
 * itself grows out of the capsule with clip-path (no reflow, no stretched corners) while it
 * fades in, in a single animation; closing runs the same animation backwards.
 */
export function usePanelMotion() {
  const app = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)

  const setPhase = (phase?: 'preparing' | 'opening' | 'closing' | 'concealed') => {
    if (!app.current) return
    if (phase) app.current.dataset.windowMotion = phase
    else delete app.current.dataset.windowMotion
  }
  const stop = () => { animation.current?.cancel(); animation.current = null }
  // The capsule sits above the window, so its shape starts at the window's top edge.
  const clip = ([x, y, width, height]: Anchor) => {
    const top = Math.max(0, y)
    return `inset(${top}px ${Math.max(0, innerWidth - x - width)}px ${Math.max(0, innerHeight - top - height)}px ${x}px round ${Math.min(radius, height / 2)}px)`
  }
  const full = `inset(0px 0px 0px 0px round ${radius}px)`
  const run = async (keyframes: Keyframe[], timing: { duration: number; easing: string }) => {
    stop()
    const p = panel.current
    if (!p) return false
    const current = p.animate(keyframes, { ...timing, fill: 'forwards' })
    animation.current = current
    try { await current.finished } catch { return false }
    return animation.current === current
  }
  const conceal = async () => { stop(); setPhase('concealed'); await nextFrame(); await nextFrame() }

  return {
    app, panel,
    /** Hides the content before the window is shown, so its first frame is already the start of the entrance. */
    prepare() { stop(); setPhase('preparing') },
    /** Waits until the shown window has painted two frames (or 120 ms if frames are throttled). */
    warm() { return Promise.race([nextFrame().then(nextFrame), new Promise<void>(resolve => setTimeout(resolve, 120))]) },
    /** Clears every motion state (used when the window appears without an entrance). */
    reset() { stop(); setPhase() },
    /** Makes the page transparent and waits until that frame is on screen, so a later show never flashes old content. */
    conceal,
    /** Grows the panel out of the capsule. Resolves true when it finished (and was not interrupted). */
    async open(anchor: Anchor) {
      setPhase('opening')
      const finished = await run([
        { clipPath: clip(anchor), opacity: 0 },
        { opacity: 1, offset: .35 },
        { clipPath: full, opacity: 1 },
      ], growing)
      if (finished) { stop(); setPhase() }
      return finished
    },
    /** Folds the panel back into the capsule, fading as it lands. */
    async close(anchor: Anchor | null) {
      if (!anchor) { await conceal(); return true }
      setPhase('closing')
      const folded = await run([
        { clipPath: full, opacity: 1 },
        { opacity: 1, offset: .5 },
        { clipPath: clip(anchor), opacity: 0 },
      ], folding)
      if (!folded) return false
      stop()
      setPhase('concealed')
      await nextFrame()
      return true
    },
  }
}
