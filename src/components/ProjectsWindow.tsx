import { useEffect, useRef, useState } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { isWindowHeader, useWindowDrag } from '../hooks/useWindowDrag'
import type { NoteSummary, Project } from '../types'
import { api } from '../services/api'
import { useAppearance } from '../hooks/useAppearance'
import { QuickProjectPicker } from './QuickProjectPicker'
import { ResizeHandles } from './ResizeHandles'

export function ProjectsWindow() {
  useAppearance()
  const drag = useWindowDrag(target => !!target.closest('.quick-project-header') && isWindowHeader(target))
  const [projects,setProjects] = useState<Project[]>([])
  const [selectedId,setSelectedId] = useState<string | null>(null)
  const [expanded,setExpanded] = useState<Set<string>>(new Set())
  const [notesByGroup,setNotesByGroup] = useState<Record<string,NoteSummary[]>>({})
  const [loading,setLoading] = useState<Set<string>>(new Set())
  const [hasMore,setHasMore] = useState<Record<string,boolean>>({})
  const [error,setError] = useState('')
  const [context,setContext] = useState<Project | null>(null)
  const generation = useRef(0)
  const fail = (failure: unknown) => setError(String(failure))
  async function loadGroup(id: string | null, offset = 0) {
    const key = id ?? 'inbox'
    const currentGeneration = generation.current
    setLoading(current => new Set(current).add(key))
    try {
      const page = await api.notes(id ? 'project' : 'inbox',id,offset)
      if (currentGeneration !== generation.current) return
      setNotesByGroup(current => ({...current,[key]:offset ? [...(current[key] ?? []),...page] : page}))
      setHasMore(current => ({...current,[key]:page.length === 200}))
    } catch (failure) { if (currentGeneration === generation.current) fail(failure) }
    finally {
      if (currentGeneration === generation.current) setLoading(current => { const next = new Set(current); next.delete(key); return next })
    }
  }
  useEffect(() => {
    let active = true
    const stops: (() => void)[] = []
    const refresh = () => { void api.projects().then(items => { if (active) setProjects(items) }).catch(fail) }
    const register = async () => {
      for (const stop of await Promise.all([
        listen<string | null>('topnote:select-project',event => {
          if (!active) return
          const id = event.payload
          generation.current++
          setSelectedId(id)
          setExpanded(new Set([id ?? 'inbox']))
          setNotesByGroup({})
          setHasMore({})
          setLoading(new Set())
          setContext(null)
          setError('')
          refresh()
          void loadGroup(id)
        }),
        listen('topnote:project-saved',refresh),
        listen('topnote:projects-changed',refresh),
      ])) { if (active) stops.push(stop); else stop() }
    }
    void register().catch(fail)
    refresh()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setContext(null); void api.hideProjects().catch(fail) } }
    window.addEventListener('keydown',escape)
    return () => { active = false; generation.current++; stops.forEach(stop => stop()); window.removeEventListener('keydown',escape) }
  }, [])
  function toggle(id: string | null) {
    const key = id ?? 'inbox'
    const shouldOpen = !expanded.has(key)
    setExpanded(current => { const next = new Set(current); if (shouldOpen) next.add(key); else next.delete(key); return next })
    if (shouldOpen && !notesByGroup[key] && !loading.has(key)) void loadGroup(id)
  }
  async function openNote(note: NoteSummary) {
    try { await emitTo('main','topnote:quick-note-selected',{noteId:note.id,projectId:note.projectId}); await api.hideProjects() }
    catch (failure) { fail(failure) }
  }
  async function newNote(id: string | null) {
    try { await emitTo('main','topnote:quick-note-new',id); await api.hideProjects() }
    catch (failure) { fail(failure) }
  }
  return <div className="projects-window" {...drag.bind}>
    <ResizeHandles minWidth={210} minHeight={240}/>
    <QuickProjectPicker projects={projects} selectedId={selectedId} expanded={expanded} notesByGroup={notesByGroup} loading={loading} hasMore={hasMore} onToggle={toggle} onOpenNote={note => { void openNote(note) }} onNewNote={id => { void newNote(id) }} onLoadMore={id => { void loadGroup(id,notesByGroup[id ?? 'inbox']?.length ?? 0) }} onNewProject={() => { void api.showDialog('project').catch(fail) }} onMenu={project => setContext(project)}/>
    {context && <div className="project-actions-cover" onClick={() => setContext(null)}><div className="project-actions"><button onClick={() => { void api.showDialog('project',context.id).catch(fail); setContext(null) }}>Editar projeto</button><button onClick={() => { if (!expanded.has(context.id)) toggle(context.id); setContext(null) }}>Mostrar notas</button></div></div>}
    {error && <div className="dialog-error" role="alert">{error}</div>}
  </div>
}
