import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Command, FileText, Search, X } from 'lucide-react'
import type { NoteSummary } from '../types'
import { api } from '../services/api'

export type PaletteCommand = { label: string; detail?: string; icon: typeof Command; run: () => void | Promise<void> }

export function CommandPalette({ commands, onOpenNote, onClose }: { commands: PaletteCommand[]; onOpenNote: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NoteSummary[]>([])
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let active = true
    const timer = setTimeout(() => { void api.search(query).then(items => { if (active) setResults(items) }).catch(() => { if (active) setResults([]) }) }, 120)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const filtered = commands.filter(item => item.label.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const entries = [
    ...filtered.map(item => ({ kind: 'command' as const, command: item })),
    ...results.map(item => ({ kind: 'note' as const, note: item })),
  ]
  const choose = (index: number) => {
    const entry = entries[index]
    if (!entry) return
    onClose()
    if (entry.kind === 'command') void entry.command.run()
    else onOpenNote(entry.note.id)
  }
  const highlight = (text: string) => {
    const at = query ? text.toLocaleLowerCase('pt-BR').indexOf(query.toLocaleLowerCase('pt-BR')) : -1
    if (at < 0) return text
    return <>{text.slice(0,at)}<mark>{text.slice(at,at+query.length)}</mark>{text.slice(at+query.length)}</>
  }
  return <div className="modal-backdrop palette-backdrop" onMouseDown={onClose}>
    <div className="palette" role="dialog" aria-modal="true" aria-label="Pesquisar e executar comandos" onMouseDown={event => event.stopPropagation()}>
      <div className="palette-search"><Search size={19}/><input ref={input} placeholder="Pesquisar notas ou executar um comando…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0) }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(i => Math.min(i+1,entries.length-1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(i => Math.max(0,i-1)) } if (event.key === 'Enter') { event.preventDefault(); choose(selected) } if (event.key === 'Escape') onClose() }}/><button onClick={onClose} aria-label="Fechar"><X size={17}/></button></div>
      <div className="palette-results">
        {filtered.length > 0 && <div className="palette-group">Comandos</div>}
        {filtered.map((item,index) => <button key={item.label} className={`palette-row ${selected === index ? 'selected' : ''}`} onMouseEnter={() => setSelected(index)} onClick={() => choose(index)}><span className="palette-row-icon"><item.icon size={16}/></span><span><strong>{highlight(item.label)}</strong>{item.detail && <small>{item.detail}</small>}</span><ArrowRight size={15} className="palette-arrow"/></button>)}
        {results.length > 0 && <div className="palette-group">Notas</div>}
        {results.map((item,index) => <button key={item.id} className={`palette-row ${selected === filtered.length + index ? 'selected' : ''}`} onMouseEnter={() => setSelected(filtered.length + index)} onClick={() => choose(filtered.length + index)}><span className="palette-row-icon"><FileText size={16}/></span><span><strong>{highlight(item.title || 'Sem título')}</strong><small>{item.projectName ? `${item.projectName} · ` : ''}{highlight(item.preview.slice(0,90))}</small></span><ArrowRight size={15} className="palette-arrow"/></button>)}
        {query && entries.length === 0 && <div className="palette-empty">Nenhum resultado para “{query}”.</div>}
      </div>
      <div className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
    </div>
  </div>
}
