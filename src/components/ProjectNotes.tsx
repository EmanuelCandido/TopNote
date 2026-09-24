import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import type { Note, NoteSummary } from '../types'
import { api } from '../services/api'

type Props = {
  projectId: string
  activeNote: Note | null
  revision: number
  onSelect: (noteId: string, projectId: string) => void
}

export function ProjectNotes({ projectId, activeNote, revision, onSelect }: Props) {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)

  useEffect(() => {
    const current = ++request.current
    setLoading(true)
    setLoadingMore(false)
    setError('')
    void api.notes('project',projectId,0).then(items => {
      if (current !== request.current) return
      setNotes(items)
      setHasMore(items.length === 200)
    }).catch(failure => {
      if (current === request.current) setError(String(failure))
    }).finally(() => {
      if (current === request.current) setLoading(false)
    })
    return () => { request.current++ }
  }, [projectId,revision])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    const current = request.current
    setLoadingMore(true)
    try {
      const next = await api.notes('project',projectId,notes.length)
      if (current !== request.current) return
      setNotes(items => [...items,...next])
      setHasMore(next.length === 200)
    } catch (failure) {
      if (current === request.current) setError(String(failure))
    } finally {
      if (current === request.current) setLoadingMore(false)
    }
  }

  return <div className="project-note-items" aria-label="Notas do projeto">
    {notes.map(item => {
      const title = activeNote?.id === item.id ? activeNote.title : item.title
      return <button key={item.id} className="project-note-nav-row" type="button" title={title || item.preview || 'Sem título'} aria-current={activeNote?.id === item.id ? 'page' : undefined} draggable onDragStart={event => event.dataTransfer.setData('application/topnote-note',item.id)} onClick={() => onSelect(item.id,projectId)}><FileText size={14}/><span>{title || item.preview || 'Sem título'}</span></button>
    })}
    {loading && notes.length === 0 && <div className="project-note-message">Carregando notas…</div>}
    {!loading && notes.length === 0 && !error && <div className="project-note-message">Nenhuma nota neste projeto</div>}
    {error && <div className="project-note-message" role="alert">{error}</div>}
    {hasMore && <button className="project-note-more" type="button" disabled={loadingMore} onClick={() => { void loadMore() }}>{loadingMore ? 'Carregando…' : 'Mostrar mais notas'}</button>}
  </div>
}
