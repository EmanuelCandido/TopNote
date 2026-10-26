import { useRef, type PointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

// Keep click and drag distinct: past a few pixels the gesture becomes a native window move,
// which Windows runs in its own loop at the display's refresh rate.
export function useWindowDrag(canStart?: (target: Element) => boolean) {
  const moved = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    moved,
    bind: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || (canStart && !canStart(event.target as Element))) return
        moved.current = false
        // A leftover text selection would turn this gesture into a native text drag.
        document.getSelection()?.removeAllRanges()
        start.current = { x: event.screenX, y: event.screenY }
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const origin = start.current
        if (!origin || !(event.buttons & 1)) return
        if (Math.hypot(event.screenX - origin.x, event.screenY - origin.y) < 5) return
        start.current = null
        moved.current = true
        void getCurrentWindow().startDragging().catch(console.error)
      },
      onPointerUp() { start.current = null },
      onPointerCancel() { start.current = null },
    },
  }
}

export const isWindowHeader = (target: Element) => !target.closest('button,input,textarea,select,a,[contenteditable="true"],.resize-handle')
