import { ChevronDown, ChevronUp } from 'lucide-react'
import { useWindowDrag } from '../hooks/useWindowDrag'

export function Capsule({ expanded = false, onOpen, onNew, onFavorites }: { expanded?: boolean; onOpen: () => void; onNew: () => void; onFavorites: () => void }) {
  const drag = useWindowDrag()
  return <button type="button" className={`capsule ${expanded ? 'expanded' : ''}`} aria-label={expanded ? 'Recolher TopNote' : 'Abrir TopNote'} title="Clique para abrir ou recolher. Arraste para mover."
    {...drag.bind}
    onClick={event => { if (!drag.moved.current || event.detail === 0) onOpen() }}
    onContextMenu={event => { event.preventDefault(); onFavorites() }}
    onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onNew() } }}>
    <span className="capsule-drag"><span className="capsule-name">TopNote</span></span>
    <span className="capsule-toggle" aria-hidden="true">{expanded ? <ChevronUp size={19}/> : <ChevronDown size={19}/>}</span>
  </button>
}
