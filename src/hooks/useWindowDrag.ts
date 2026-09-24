import { useEffect, useRef, type PointerEvent } from 'react'
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window'

// Keep click and drag distinct, including short gestures and release outside the window.
export function useWindowDrag(canStart?: (target: Element) => boolean) {
  const moved = useRef(false)
  const active = useRef<{
    x: number; y: number; lastX: number; lastY: number
    origin: Promise<{x:number;y:number;scale:number}>
  } | null>(null)
  const pending = useRef<PhysicalPosition | null>(null)
  const writing = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; active.current = null; pending.current = null } }, [])

  async function drain() {
    if (writing.current) return
    writing.current = true
    try {
      while (pending.current && alive.current) {
        const position = pending.current
        pending.current = null
        await getCurrentWindow().setPosition(position)
      }
    } catch (error) { console.error(error) }
    finally { writing.current = false }
  }

  function move(event: PointerEvent<HTMLElement>) {
    const gesture = active.current
    if (!gesture) return
    gesture.lastX = event.screenX
    gesture.lastY = event.screenY
    if (!moved.current && Math.hypot(event.screenX-gesture.x,event.screenY-gesture.y) < 5) return
    moved.current = true
    void gesture.origin.then(origin => {
      if (!alive.current) return
      pending.current = new PhysicalPosition(Math.round(origin.x+(gesture.lastX-gesture.x)*origin.scale),Math.round(origin.y+(gesture.lastY-gesture.y)*origin.scale))
      void drain()
    }).catch(console.error)
  }

  return {
    moved,
    bind: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || (canStart && !canStart(event.target as Element))) return
        moved.current = false
        const window = getCurrentWindow()
        active.current = {x:event.screenX,y:event.screenY,lastX:event.screenX,lastY:event.screenY,origin:Promise.all([window.outerPosition(),window.scaleFactor()]).then(([position,scale]) => ({...position,scale}))}
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove(event: PointerEvent<HTMLElement>) { if (event.buttons & 1) move(event) },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (!active.current) return
        move(event)
        active.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      },
      onPointerCancel() { active.current = null },
    },
  }
}

export const isWindowHeader = (target: Element) => !target.closest('button,input,textarea,select,a,[contenteditable="true"],.resize-handle')
