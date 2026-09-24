import { ChevronDown, FileText, Inbox, Plus } from 'lucide-react'
import type { NoteSummary, Project } from '../types'
import { ProjectIcon } from './ProjectIcon'

type Props = {
  projects: Project[]
  selectedId: string | null
  expanded: Set<string>
  notesByGroup: Record<string, NoteSummary[]>
  loading: Set<string>
  hasMore: Record<string, boolean>
  onToggle: (id: string | null) => void
  onOpenNote: (note: NoteSummary) => void
  onNewNote: (id: string | null) => void
  onLoadMore: (id: string | null) => void
  onNewProject: () => void
  onMenu: (project: Project, x: number, y: number) => void
}

export function QuickProjectPicker({
  projects, selectedId, expanded, notesByGroup, loading, hasMore,
  onToggle, onOpenNote, onNewNote, onLoadMore, onNewProject, onMenu,
}: Props) {
  const visible = projects.filter(project => !project.isArchived && !project.isDeleted)
  const groups = [{ id: null, name: 'Inbox', project: null }, ...visible.map(project => ({ id: project.id, name: project.name, project }))]

  return <aside className="quick-project-picker" aria-label="Projetos e notas">
    <header className="quick-project-header"><span>Projetos</span><button className="quick-project-add" title="Novo projeto" aria-label="Novo projeto" onClick={onNewProject}><Plus size={20}/></button></header>
    <div className="quick-project-list">
      {groups.map(group => {
        const key = group.id ?? 'inbox'
        const isExpanded = expanded.has(key)
        const groupNotes = notesByGroup[key] ?? []
        return <div className="quick-project-group" key={key}>
          <div className="quick-project-heading">
            <button className="quick-project-row" type="button" aria-expanded={isExpanded} aria-current={selectedId === group.id ? 'true' : undefined} onClick={() => onToggle(group.id)} onContextMenu={event => { if (group.project) { event.preventDefault(); onMenu(group.project,event.clientX,event.clientY) } }}>
              {group.project ? <ProjectIcon name={group.project.icon} size={24}/> : <Inbox size={21}/>}
              <span>{group.name}</span><ChevronDown className="quick-project-chevron" size={16}/>
            </button>
            <button className="quick-project-note-add" type="button" title={`Nova nota em ${group.name}`} aria-label={`Nova nota em ${group.name}`} onClick={() => onNewNote(group.id)}><Plus size={17}/></button>
          </div>
          {isExpanded && <div className="quick-project-notes">
            {groupNotes.map(note => <button className="quick-project-note" type="button" key={note.id} title={note.title || note.preview || 'Sem título'} onClick={() => onOpenNote(note)}><FileText size={15}/><span>{note.title || note.preview || 'Sem título'}</span></button>)}
            {loading.has(key) && <div className="quick-project-note-empty">Carregando notas…</div>}
            {!loading.has(key) && groupNotes.length === 0 && <div className="quick-project-note-empty">Nenhuma nota neste grupo</div>}
            {!loading.has(key) && hasMore[key] && <button className="quick-project-load-more" type="button" onClick={() => onLoadMore(group.id)}>Mostrar mais notas</button>}
          </div>}
        </div>
      })}
    </div>
    <button className="quick-project-create" onClick={onNewProject}><Plus size={19}/> Novo projeto</button>
  </aside>
}
