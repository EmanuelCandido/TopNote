import { useEffect, useRef, useState } from 'react'
import type { NoteSummary, Project } from '../types'
import { api } from '../services/api'
import { QuickProjectPicker } from './QuickProjectPicker'

type Props = {
  projects: Project[]
  selectedId: string | null
  onOpenNote: (note: NoteSummary) => void
  onNewNote: (projectId: string | null) => void
  onNewProject: () => void
  onEditProject: (project: Project) => void
  onClose: () => void
}

/** The projects list as a glass sheet over the quick editor, in the same window and WebView. */
export function ProjectsSheet({ projects, selectedId, onOpenNote, onNewNote, onNewProject, onEditProject, onClose }: Props) {
  const [expanded,setExpanded] = useState<Set<string>>(() => new Set(selectedId ? [selectedId] : []))
  const [notesByGroup,setNotesByGroup] = useState<Record<string,NoteSummary[]>>({})
  const [loading,setLoading] = useState<Set<string>>(new Set())
  const [hasMore,setHasMore] = useState<Record<string,boolean>>({})
  const [error,setError] = useState('')
  const [context,setContext] = useState<Project | null>(null)
  const alive = useRef(true)

  async function loadGroup(id: string, offset = 0) {
    setLoading(current => new Set(current).add(id))
    try {
      const page = await api.notes('project',id,offset)
      if (!alive.current) return
      setNotesByGroup(current => ({...current,[id]:offset ? [...(current[id] ?? []),...page] : page}))
      setHasMore(current => ({...current,[id]:page.length === 200}))
    } catch (failure) { if (alive.current) setError(String(failure)) }
    finally {
      if (alive.current) setLoading(current => { const next = new Set(current); next.delete(id); return next })
    }
  }
  // The sheet mounts fresh each time it opens, so the selected project loads once per opening.
  useEffect(() => {
    alive.current = true
    if (selectedId) void loadGroup(selectedId)
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (context) setContext(null)
      else onClose()
    }
    window.addEventListener('keydown',escape,true)
    return () => window.removeEventListener('keydown',escape,true)
  }, [context, onClose])
  function toggle(id: string | null) {
    if (!id) return
    const shouldOpen = !expanded.has(id)
    setExpanded(current => { const next = new Set(current); if (shouldOpen) next.add(id); else next.delete(id); return next })
    if (shouldOpen && !notesByGroup[id] && !loading.has(id)) void loadGroup(id)
  }

  return <div className="projects-sheet-cover" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="projects-sheet">
      <QuickProjectPicker projects={projects} selectedId={selectedId} expanded={expanded} notesByGroup={notesByGroup} loading={loading} hasMore={hasMore} onToggle={toggle} onOpenNote={onOpenNote} onNewNote={onNewNote} onLoadMore={id => { if (id) void loadGroup(id,notesByGroup[id]?.length ?? 0) }} onNewProject={onNewProject} onMenu={project => setContext(project)}/>
      {context && <div className="project-actions-cover" onClick={() => setContext(null)}><div className="project-actions"><button onClick={() => { onEditProject(context); setContext(null) }}>Editar projeto</button><button onClick={() => { if (!expanded.has(context.id)) toggle(context.id); setContext(null) }}>Mostrar notas</button></div></div>}
      {error && <div className="dialog-error" role="alert">{error}</div>}
    </div>
  </div>
}
