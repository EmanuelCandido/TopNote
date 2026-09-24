import { useRef, type PointerEvent } from 'react'
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'

const directions = ['NorthWest','North','NorthEast','East','SouthEast','South','SouthWest','West'] as const
type Direction = typeof directions[number]
type Bounds = {x:number;y:number;width:number;height:number}

export function ResizeHandles({minWidth = 360,minHeight = 250}: {minWidth?:number;minHeight?:number}) {
  const gesture = useRef<{direction:Direction;x:number;y:number;dx:number;dy:number;origin:Promise<Bounds & {scale:number}>} | null>(null)
  const pending = useRef<Bounds | null>(null)
  const writing = useRef(false)
  async function drain() {
    if (writing.current) return
    writing.current = true
    try {
      while (pending.current) {
        const bounds = pending.current
        pending.current = null
        const window = getCurrentWindow()
        await window.setSize(new PhysicalSize(bounds.width,bounds.height))
        await window.setPosition(new PhysicalPosition(bounds.x,bounds.y))
      }
    } catch (error) { console.error(error) }
    finally { writing.current = false }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current) return
    current.dx = event.screenX-current.x
    current.dy = event.screenY-current.y
    void current.origin.then(origin => {
      const {direction,dx,dy} = current
      const width = Math.max(minWidth*origin.scale,origin.width+(direction.includes('East') ? dx*origin.scale : direction.includes('West') ? -dx*origin.scale : 0))
      const height = Math.max(minHeight*origin.scale,origin.height+(direction.includes('South') ? dy*origin.scale : direction.includes('North') ? -dy*origin.scale : 0))
      pending.current = {
        x:Math.round(origin.x+(direction.includes('West') ? origin.width-width : 0)),
        y:Math.round(origin.y+(direction.includes('North') ? origin.height-height : 0)),
        width:Math.round(width),height:Math.round(height),
      }
      void drain()
    }).catch(console.error)
  }
  return <div className="resize-handles" aria-hidden="true">
    {directions.map(direction => <div key={direction} className={`resize-handle resize-${direction.toLowerCase()}`}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation()
        const window = getCurrentWindow()
        gesture.current = {direction,x:event.screenX,y:event.screenY,dx:0,dy:0,origin:Promise.all([window.outerPosition(),window.outerSize(),window.scaleFactor()]).then(([position,size,scale]) => ({x:position.x,y:position.y,width:size.width,height:size.height,scale}))}
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => { if (event.buttons & 1) move(event) }}
      onPointerUp={event => { move(event); gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { gesture.current = null }}
    />)}
  </div>
}
