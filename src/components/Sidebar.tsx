import { Archive, ChevronDown, ChevronRight, Clock3, FileText, Folder, Inbox, Layers3, Plus, Star, Trash2 } from 'lucide-react'
import { isWindowHeader, useWindowDrag } from '../hooks/useWindowDrag'
import type { Folder as FolderType, Note, Project, View } from '../types'
import { ProjectIcon } from './ProjectIcon'
import { ProjectNotes } from './ProjectNotes'

type Props = {
  projects: Project[]
  folders: FolderType[]
  view: View
  targetId: string | null
  activeNote: Note | null
  notesRevision: number
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (view: View, targetId?: string | null) => void
  onSelectNote: (noteId: string, projectId: string) => void
  onNewProject: () => void
  onNewNote: (projectId: string) => void
  onProjectMenu: (project: Project, x: number, y: number) => void
  onFolderMenu: (folder: FolderType, x: number, y: number) => void
  onMoveNote: (noteId: string, projectId: string | null, folderId: string | null) => void
  onReorderProjects: (sourceId: string, targetId: string) => void
  onReorderFolders: (sourceId: string, targetId: string) => void
}

export function Sidebar(props: Props) {
  const drag = useWindowDrag(isWindowHeader)
  const { projects, folders, view, targetId, activeNote, notesRevision, expanded, onToggle, onSelect, onSelectNote, onNewProject, onNewNote, onProjectMenu, onFolderMenu, onMoveNote, onReorderProjects, onReorderFolders } = props
  const sections = [
    { id: 'inbox' as View, label: 'Inbox', icon: Inbox },
    { id: 'favorites' as View, label: 'Favoritos', icon: Star },
    { id: 'recent' as View, label: 'Recentes', icon: Clock3 },
    { id: 'all' as View, label: 'Todas as notas', icon: Layers3 },
    { id: 'archive' as View, label: 'Arquivo', icon: Archive },
    { id: 'trash' as View, label: 'Lixeira', icon: Trash2 },
  ]
  return <aside className="sidebar">
    <div className="sidebar-brand" {...drag.bind}><FileText size={25} strokeWidth={2.2}/><span>TopNote</span></div>
    <div className="sidebar-section-label">Biblioteca</div>
    <nav aria-label="Biblioteca">
      {sections.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)} onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData('application/topnote-note'); if (id && item.id === 'inbox') onMoveNote(id,null,null) }}><item.icon size={17} strokeWidth={1.8}/>{item.label}</button>)}
    </nav>
    <div className="sidebar-section-label project-heading"><span>Projetos</span><button title="Novo projeto" aria-label="Novo projeto" onClick={onNewProject}><Plus size={16}/></button></div>
    <nav className="projects-nav" aria-label="Projetos">
      {projects.filter(p => !p.isArchived && !p.isDeleted).length === 0 && <div className="sidebar-empty">Organize suas notas criando um projeto.</div>}
      {projects.filter(p => !p.isArchived && !p.isDeleted).map(project => {
        const projectFolders = folders.filter(f => f.projectId === project.id && !f.isDeleted)
        const open = expanded.has(project.id)
        return <div key={project.id} className="project-nav-group">
          <div className={`project-nav-row ${view === 'project' && targetId === project.id ? 'active' : ''}`} draggable onDragStart={event => event.dataTransfer.setData('application/topnote-project',project.id)} onDragOver={event => event.preventDefault()} onDrop={event => { const note = event.dataTransfer.getData('application/topnote-note'); const source = event.dataTransfer.getData('application/topnote-project'); if (note) onMoveNote(note,project.id,null); else if (source && source !== project.id) onReorderProjects(source,project.id) }} onContextMenu={event => { event.preventDefault(); onProjectMenu(project,event.clientX,event.clientY) }}>
            <button className="project-disclosure" aria-label={open ? `Recolher notas de ${project.name}` : `Expandir notas de ${project.name}`} aria-expanded={open} onClick={() => onToggle(project.id)}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
            <button className="project-label" onClick={() => onSelect('project',project.id)}><ProjectIcon name={project.icon} color={project.color} size={17}/><span>{project.name}</span></button>
            <button className="project-add-note" title="Nova nota" aria-label={`Nova nota em ${project.name}`} onClick={() => onNewNote(project.id)}><Plus size={14}/></button>
          </div>
          {open && projectFolders.map(folder => <button key={folder.id} className={`folder-nav-row ${view === 'folder' && targetId === folder.id ? 'active' : ''}`} draggable onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/topnote-folder',folder.id) }} onDragOver={event => event.preventDefault()} onDrop={event => { event.stopPropagation(); const note = event.dataTransfer.getData('application/topnote-note'); const source = event.dataTransfer.getData('application/topnote-folder'); if (note) onMoveNote(note,project.id,folder.id); else if (source && source !== folder.id) onReorderFolders(source,folder.id) }} onContextMenu={event => { event.preventDefault(); onFolderMenu(folder,event.clientX,event.clientY) }} onClick={() => onSelect('folder',folder.id)}><Folder size={14}/><span>{folder.name}</span></button>)}
          {open && <ProjectNotes projectId={project.id} activeNote={activeNote} revision={notesRevision} onSelect={onSelectNote}/>}
        </div>
      })}
    </nav>
    {projects.some(p => p.isArchived && !p.isDeleted) && <div className="inactive-projects"><div className="sidebar-section-label">Arquivados</div>{projects.filter(p => p.isArchived && !p.isDeleted).map(project => <button key={project.id} onContextMenu={event => { event.preventDefault(); onProjectMenu(project,event.clientX,event.clientY) }} onClick={() => onProjectMenu(project,70,window.innerHeight-230)}>{project.name} · Restaurar</button>)}</div>}
    {projects.some(p => p.isDeleted) && <div className="inactive-projects"><div className="sidebar-section-label">Excluídos</div>{projects.filter(p => p.isDeleted).map(project => <button key={project.id} onContextMenu={event => { event.preventDefault(); onProjectMenu(project,event.clientX,event.clientY) }} onClick={() => onProjectMenu(project,70,window.innerHeight-230)}>{project.name} · Restaurar</button>)}</div>}
    <div className="sidebar-bottom"><span className="online-dot"/> Seus dados ficam neste computador</div>
  </aside>
}
