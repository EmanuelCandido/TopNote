import { getCurrentWindow } from '@tauri-apps/api/window'

const directions = ['NorthWest','North','NorthEast','East','SouthEast','South','SouthWest','West'] as const

/** Edge handles that hand the gesture to Windows' own resize loop; the minimum size is the window's. */
export function ResizeHandles() {
  return <div className="resize-handles" aria-hidden="true">
    {directions.map(direction => <div key={direction} className={`resize-handle resize-${direction.toLowerCase()}`}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault(); event.stopPropagation()
        void getCurrentWindow().startResizeDragging(direction).catch(console.error)
      }}
    />)}
  </div>
}
