import { FileText, MoreHorizontal, Pin, Plus, Search, Trash2 } from 'lucide-react'
import type { NoteSummary, View } from '../types'
import { formatDate } from '../services/format'

type Props = {
  title: string
  view: View
  notes: NoteSummary[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onSearch: () => void
  onMenu: (note: NoteSummary, x: number, y: number) => void
  onEmptyTrash: () => void
  onLoadMore: () => void
}

export function NoteList({ title, view, notes, selectedId, loading, onSelect, onNew, onSearch, onMenu, onEmptyTrash, onLoadMore }: Props) {
  return <section className="note-list-pane">
    <div className="list-header"><div><div className="eyebrow">TopNote / Biblioteca</div><h1>{title}</h1></div><div className="list-header-actions"><button className="icon-button" title="Pesquisar" aria-label="Pesquisar" onClick={onSearch}><Search size={17}/></button>{view !== 'trash' && <button className="accent-icon-button" title="Nova nota" aria-label="Nova nota" onClick={onNew}><Plus size={18}/></button>}</div></div>
    <div className="list-count">{notes.length} {notes.length === 1 ? 'nota' : 'notas'}{notes.length >= 200 ? ' nesta página' : ''}</div>
    <div className="note-list-scroll" onScroll={event => { const element = event.currentTarget; if (element.scrollTop + element.clientHeight >= element.scrollHeight - 100) onLoadMore() }}>
      {loading && <div className="list-loading">Carregando notas…</div>}
      {!loading && notes.length === 0 && <div className="notes-empty"><div className="empty-icon"><FileText size={22}/></div><strong>{view === 'trash' ? 'A lixeira está vazia' : 'Nenhuma nota por aqui'}</strong><p>{view === 'inbox' ? 'Anote primeiro. Organize depois.' : view === 'trash' ? 'Notas excluídas ficam aqui até você esvaziar a lixeira.' : 'Crie uma nota ou escolha outra seção.'}</p>{view !== 'trash' && <button className="primary-button" onClick={onNew}><Plus size={15}/>Nova nota</button>}</div>}
      {notes.map(note => <div key={note.id} className={`note-row ${selectedId === note.id ? 'selected' : ''}`} draggable onDragStart={event => event.dataTransfer.setData('application/topnote-note',note.id)} onContextMenu={event => { event.preventDefault(); onMenu(note,event.clientX,event.clientY) }}>
        <button className="note-row-main" onClick={() => onSelect(note.id)}><span className="note-title-line"><span className="note-row-title">{note.title || 'Sem título'}</span>{note.isPinned && <Pin size={13} className="pinned-icon"/>}</span><span className="note-preview">{note.preview || 'Nota vazia'}</span><span className="note-meta">{note.projectName && <span className="note-project">{note.projectName}</span>}<span>{formatDate(note.updatedAt)}</span></span></button>
        <button className="note-row-menu" aria-label={`Ações para ${note.title || 'nota'}`} onClick={event => onMenu(note,event.clientX,event.clientY)}><MoreHorizontal size={17}/></button>
      </div>)}
      {view === 'trash' && notes.length > 0 && <button className="empty-trash" onClick={onEmptyTrash}><Trash2 size={14}/>Esvaziar lixeira</button>}
    </div>
  </section>
}
