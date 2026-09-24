import { useEffect, useRef, useState } from 'react'
import { Archive, Check, ChevronDown, ChevronsDown, Clock3, Code2, Ellipsis, EllipsisVertical, FolderOpen, Image as ImageIcon, List, Minimize2, Paperclip, Pin, Plus, Search, Settings, Star, Tag, Trash2, X } from 'lucide-react'
import type { Attachment, Folder, Note, Project, SaveStatus } from '../types'
import { NoteEditor } from './NoteEditor'
import { isWindowHeader, useWindowDrag } from '../hooks/useWindowDrag'
import { AttachmentsPanel } from './AttachmentsPanel'
import { formatDate } from '../services/format'

type Props = {
  note: Note
  projects: Project[]
  folders: Folder[]
  tags: string[]
  attachments: Attachment[]
  status: SaveStatus
  compact: boolean
  onUpdate: (changes: Partial<Note>) => void
  onFiles: (files: File[]) => Promise<Attachment[]>
  onPick: (images: boolean) => Promise<Attachment[]>
  onTags: (tags: string[]) => Promise<void>
  onRemoveAttachment: (item: Attachment) => Promise<void>
  onState: (action: string) => Promise<void>
  onWorkspace: () => void
  onCapsule: () => void
  onSearch: () => void
  onSettings: () => void
  onVersions: () => void
  onExport: () => void
  onRetry: () => void
  onToggleProjects?: () => void
  onNewQuickNote?: () => void
  projectsOpen?: boolean
}

export function NoteDetail(props: Props) {
  const drag = useWindowDrag(isWindowHeader)
  const { note, projects, folders, tags, attachments, status, compact, onUpdate, onFiles, onPick, onTags, onRemoveAttachment, onState, onWorkspace, onCapsule, onSearch, onSettings, onVersions, onExport, onRetry, onToggleProjects, onNewQuickNote, projectsOpen } = props
  const [tagInput, setTagInput] = useState('')
  const [showAttachments, setShowAttachments] = useState(false)
  const observedAttachments = useRef({ noteId: note.id, count: attachments.length })
  const [showProperties, setShowProperties] = useState(() => window.innerWidth >= 1100)
  const [menu, setMenu] = useState(false)
  const [showFormatting, setShowFormatting] = useState(false)
  const [showTags, setShowTags] = useState(false)
  useEffect(() => {
    const previous = observedAttachments.current
    if (previous.noteId !== note.id) setShowAttachments(false)
    else if (compact && attachments.length > previous.count) setShowAttachments(true)
    observedAttachments.current = { noteId: note.id, count: attachments.length }
  }, [attachments.length, compact, note.id])
  const projectFolders = folders.filter(f => f.projectId === note.projectId && !f.isDeleted)
  const visibleProjects = projects.filter(p => !p.isDeleted && !p.isArchived)
  const addTag = () => { const tag = tagInput.trim(); if (tag && !tags.some(t => t.toLowerCase() === tag.toLowerCase())) void onTags([...tags,tag]); setTagInput('') }
  const projectName = visibleProjects.find(p => p.id === note.projectId)?.name ?? 'Inbox'
  const editorAction = (action: 'image' | 'taskList' | 'codeBlock') => window.dispatchEvent(new CustomEvent('topnote:editor-action', { detail: action }))
  return <div className={`note-detail ${compact ? 'quick-detail' : 'workspace-detail'} ${showFormatting ? 'show-formatting' : ''}`}>
    <header className="detail-header" {...drag.bind}>
      <div className="detail-path">{compact ? <><button className="quick-project-trigger" aria-expanded={!!projectsOpen} onClick={onToggleProjects}><span>{projectName}</span><ChevronDown size={17}/></button><button className="quick-note-add" type="button" aria-label={`Nova nota em ${projectName}`} title={`Nova nota em ${projectName}`} onClick={onNewQuickNote}><Plus size={19}/></button></> : <><span className="detail-project-dot" style={{ background: visibleProjects.find(p => p.id === note.projectId)?.color ?? '#72a1f5' }}/><select aria-label="Projeto da nota" value={note.projectId ?? ''} onChange={event => onUpdate({ projectId: event.target.value || null, folderId: null })}><option value="">Inbox</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="path-separator">/</span><select aria-label="Pasta da nota" value={note.folderId ?? ''} disabled={!note.projectId} onChange={event => onUpdate({ folderId: event.target.value || null })}><option value="">Sem pasta</option>{projectFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></>}</div>
      <div className="detail-actions"><button className="icon-button" title="Pesquisar (Ctrl+K)" onClick={onSearch}><Search size={compact ? 22 : 18}/></button>{compact ? <button className="icon-button" title="Configurações" onClick={onSettings}><Settings size={22}/></button> : <><button className="icon-button" title="Fixar nota" onClick={() => void onState(note.isPinned ? 'unpin' : 'pin')}><Star size={17} fill={note.isPinned ? 'currentColor' : 'none'} /></button><button className="icon-button" title="Mostrar propriedades" onClick={() => setShowProperties(v => !v)}><ChevronsDown size={17}/></button><div className="detail-menu-holder"><button className="icon-button" title="Mais ações" onClick={() => setMenu(v => !v)}><Ellipsis size={19}/></button>{menu && <div className="detail-more-menu"><button onClick={() => { setMenu(false); onVersions() }}><Clock3 size={15}/>Histórico</button><button onClick={() => { setMenu(false); onExport() }}><FolderOpen size={15}/>Exportar</button><button onClick={() => { setMenu(false); void onState('archive') }}><Archive size={15}/>Arquivar</button><button className="danger" onClick={() => { setMenu(false); void onState('delete') }}><Trash2 size={15}/>Mover para lixeira</button></div>}</div></>}</div>
    </header>
    <div className="detail-main">
      <div className="detail-editor-column">
        <div className="note-title-block"><div className="note-kicker">{compact ? 'NOTA RÁPIDA' : projectName.toUpperCase()}</div><input className="note-title-input" aria-label="Título da nota" placeholder="Sem título" value={note.title} onChange={event => onUpdate({ title: event.target.value })}/><div className="note-submeta">{compact ? <time dateTime={new Date(note.createdAt * 1000).toISOString()}>{new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"long",year:"numeric"}).format(note.createdAt * 1000)}<span className="note-date-separator">·</span>{new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(note.createdAt * 1000)}</time> : <>Criada em {formatDate(note.createdAt)}<span> · Atualizada em {formatDate(note.updatedAt)}</span></>}</div></div>
        <NoteEditor note={note} compact={compact} onChange={(contentJson, contentText) => onUpdate({ contentJson, contentText })} onFiles={onFiles} onPick={onPick}/>
        {compact && showTags && <div className="quick-extras"><div className="quick-tags"><Tag size={14}/>{tags.map(tag => <button key={tag} className="tag-chip" title="Remover tag" onClick={() => void onTags(tags.filter(t => t !== tag))}>#{tag} ×</button>)}<input aria-label="Adicionar tag" placeholder="Adicionar tag…" value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }}/></div>{note.projectId && <select aria-label="Pasta" value={note.folderId ?? ''} onChange={event => onUpdate({ folderId: event.target.value || null })}><option value="">Sem pasta</option>{projectFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}</div>}
      </div>
      {!compact && showProperties && <aside className="properties-pane"><div className="properties-title">Propriedades</div><div className="property-section"><div className="property-heading"><Tag size={15}/>Tags</div><div className="tags-wrap">{tags.map(tag => <button key={tag} className="tag-chip" title="Remover tag" onClick={() => void onTags(tags.filter(t => t !== tag))}>#{tag} <X size={11}/></button>)}</div><input className="tag-entry" placeholder="Adicionar tag e Enter" value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }}/></div><AttachmentsPanel attachments={attachments} onRemove={item => void onRemoveAttachment(item)}/><div className="property-section"><div className="property-heading"><Clock3 size={15}/>Informações</div><div className="info-line"><span>Criada</span><span>{formatDate(note.createdAt)}</span></div><div className="info-line"><span>Atualizada</span><span>{formatDate(note.updatedAt)}</span></div><button className="text-action" onClick={onVersions}>Ver histórico da nota</button></div></aside>}
    </div>
    {compact && showAttachments && <div className="quick-attachments"><AttachmentsPanel attachments={attachments} onRemove={item => void onRemoveAttachment(item)}/></div>}
    <footer className="detail-footer"><div className="footer-left">{compact ? <><button className={`footer-tool ${showAttachments ? 'active' : ''}`} onClick={() => { void onPick(false).then(() => setShowAttachments(true)) }} title="Anexar arquivo"><Paperclip size={23}/>{attachments.length > 0 && <span>{attachments.length}</span>}</button><button className="footer-tool" onClick={() => editorAction('image')} title="Inserir imagem"><ImageIcon size={23}/></button><button className="footer-tool" onClick={() => editorAction('taskList')} title="Checklist"><List size={23}/></button><button className="footer-tool" onClick={() => editorAction('codeBlock')} title="Bloco de código"><Code2 size={24}/></button></> : <button className="footer-tool" onClick={onCapsule} title="Recolher para cápsula"><Minimize2 size={15}/> Recolher</button>}</div><div className="footer-right"><button className={`save-status ${status === 'error' ? 'error' : ''}`} onClick={status === 'error' ? onRetry : undefined} title={status === 'error' ? 'Tentar salvar novamente' : undefined}>{status === 'saving' ? <><span className="saving-dot"/>Salvando…</> : status === 'error' ? 'Não foi possível salvar · Tentar novamente' : <><Check size={16}/>Salvo</>}</button>{compact && <div className="detail-menu-holder"><button className="footer-tool" aria-label="Mais ações" title="Mais ações" onClick={() => setMenu(value => !value)}><EllipsisVertical size={22}/></button>{menu && <div className="detail-more-menu quick-more-menu"><button onClick={() => { setMenu(false); setShowFormatting(value => !value) }}>{showFormatting ? 'Ocultar' : 'Mostrar'} formatação</button><button onClick={() => { setMenu(false); setShowAttachments(v => !v) }}><Paperclip size={15}/> Ver anexos</button><button onClick={() => { setMenu(false); setShowTags(value => !value) }}><Tag size={15}/> Tags e pasta</button><button onClick={() => { setMenu(false); void onState(note.isPinned ? 'unpin' : 'pin') }}><Pin size={15}/>{note.isPinned ? 'Desafixar nota' : 'Fixar nota'}</button><button onClick={() => { setMenu(false); onWorkspace() }}>Abrir Workspace</button><button onClick={() => { setMenu(false); onVersions() }}><Clock3 size={15}/> Histórico</button><button onClick={() => { setMenu(false); onExport() }}><FolderOpen size={15}/> Exportar</button><button onClick={() => { setMenu(false); void onState('archive') }}><Archive size={15}/> Arquivar</button><button className="danger" onClick={() => { setMenu(false); void onState('delete') }}><Trash2 size={15}/> Mover para lixeira</button></div>}</div>}</div></footer>
  </div>
}
