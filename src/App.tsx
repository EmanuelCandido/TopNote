import { useCallback, useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Archive, ArrowLeft, ChevronUp, Download, FilePlus2, FileText, FolderPlus, Import, Keyboard, LayoutDashboard, Plus, Search, Settings2, Star, X } from 'lucide-react'
import type { Attachment, Folder, Mode, Note, NoteSummary, Project, SaveStatus, Settings as SettingsType, View } from './types'
import { api } from './services/api'
import { Autosave } from './services/autosave'
import { formatDate, removeImage, toMarkdown } from './services/format'
import { toHtml } from './services/export'
import { Sidebar } from './components/Sidebar'
import { BrandIcon } from './components/BrandIcon'
import { NoteList } from './components/NoteList'
import { NoteDetail } from './components/NoteDetail'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { Onboarding } from './components/Onboarding'
import { Settings } from './components/Settings'
import { ResizeHandles } from './components/ResizeHandles'
import { useAppearance } from './hooks/useAppearance'
import { isWindowHeader, useWindowDrag } from './hooks/useWindowDrag'

type Dialog = { type: 'project'; project?: Project } | { type: 'folder'; projectId: string; folder?: Folder } | { type: 'versions' } | null
type ContextMenu = { type: 'note'; note: NoteSummary; x: number; y: number } | { type: 'project'; project: Project; x: number; y: number } | { type: 'folder'; folder: Folder; x: number; y: number } | null

export default function App() {
  useAppearance()
  const workspaceDrag = useWindowDrag(isWindowHeader)
  const [mode, setModeState] = useState<Mode>('capsule')
  const [page, setPage] = useState<'notes' | 'settings'>('notes')
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [view, setView] = useState<View>('inbox')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [notesRevision, setNotesRevision] = useState(0)
  const [note, setNote] = useState<Note | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [settings, setSettings] = useState<SettingsType>({})
  const [dataPath, setDataPath] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [palette, setPalette] = useState<'all' | 'projects' | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null)
  const [quickFavorites, setQuickFavorites] = useState(false)
  const [quickProjectsOpen, setQuickProjectsOpen] = useState(false)
  const [favoriteNotes, setFavoriteNotes] = useState<NoteSummary[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const favoritesRequestRef = useRef(false)
  const creatingNoteRef = useRef(false)
  const navigationRef = useRef(0)
  const noteRef = useRef<Note | null>(null)
  const modeRef = useRef<Mode>(mode)
  const quickProjectsOpenRef = useRef(false)
  const viewRef = useRef({ view, targetId })
  noteRef.current = note
  modeRef.current = mode
  viewRef.current = { view, targetId }
  const handlersRef = useRef({} as { navigate: (action: string) => void; close: () => void; mode: (next: Mode) => void; requestMode: (next: string) => void; projectSelected: (id: string | null) => void; quickNoteSelected: (value: {noteId:string;projectId:string|null}) => void; quickNoteNew: (id: string | null) => void; projectSaved: (value: {id:string;isNew:boolean}) => void; folderSaved: (value: {id:string;projectId:string;isNew:boolean}) => void; restoreVersion: (id:string) => void })
  const autosaveRef = useRef<Autosave | null>(null)
  if (!autosaveRef.current) autosaveRef.current = new Autosave(async patch => {
    const saved = await api.saveNote(patch)
    setNote(current => current?.id === saved.id ? { ...current, updatedAt: saved.updatedAt } : current)
    setNotes(current => current.map(item => item.id === saved.id ? { ...item, title: saved.title, preview: saved.contentText.slice(0,220), projectId: saved.projectId, folderId: saved.folderId, updatedAt: saved.updatedAt } : item))
    setNotesRevision(current => current + 1)
  }, setSaveStatus, failure => {
    const message = String(failure)
    setError(`Não foi possível salvar a nota. ${message}`)
    void api.reportError(message).catch(console.error)
  })
  const autosave = autosaveRef.current

  const showError = useCallback((failure: unknown) => {
    const message = String(failure)
    setError(message)
    void api.reportError(message).catch(console.error)
  }, [])
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    let active = true
    void Promise.all([api.settings(),api.projects(),api.folders(),api.notes('inbox',null,0),api.dataDirectory(),api.mode()]).then(async ([preferences,allProjects,allFolders,inbox,path,currentMode]) => {
      let previous: Note | null = null
      for (const id of [...new Set([preferences.lastNoteId,inbox[0]?.id].filter((id): id is string => Boolean(id)))]) {
        const candidate = await api.note(id).catch(() => null)
        if (candidate && !candidate.isDeleted && !candidate.isArchived) { previous = candidate; break }
      }
      const previousView: View = previous?.folderId ? 'folder' : previous?.projectId ? 'project' : 'inbox'
      const previousTarget = previous?.folderId ?? previous?.projectId ?? null
      const [initialNotes,initialTags,initialFiles] = await Promise.all([
        previousView === 'inbox' ? Promise.resolve(inbox) : api.notes(previousView,previousTarget),
        previous ? api.tags(previous.id) : Promise.resolve([]),
        previous ? api.attachments(previous.id) : Promise.resolve([]),
      ])
      if (!active) return
      setSettings(preferences)
      setProjects(allProjects)
      setFolders(allFolders)
      setNotes(initialNotes)
      setView(previousView); setTargetId(previousTarget)
      viewRef.current = {view:previousView,targetId:previousTarget}
      noteRef.current = previous
      setNote(previous); setTags(initialTags); setAttachments(initialFiles)
      setDataPath(path)
      setOnboarding(preferences.onboardingDone !== 'true')
      modeRef.current = currentMode
      setModeState(currentMode)
      setLoading(false)
    }).catch(showError)
    return () => { active = false }
  }, [showError])

  useEffect(() => {
    if (note?.id) void api.setSetting('lastNoteId',note.id).catch(showError)
  }, [note?.id,showError])

  useEffect(() => {
    const unlisteners: UnlistenFn[] = []
    let active = true
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const register = async () => {
      const events = await Promise.all([
        listen<string>('topnote:mode', event => handlersRef.current.mode(event.payload as Mode)),
        listen<string>('topnote:request-mode', event => handlersRef.current.requestMode(event.payload)),
        listen<string | null>('topnote:project-selected', event => handlersRef.current.projectSelected(event.payload)),
        listen<{noteId:string;projectId:string|null}>('topnote:quick-note-selected', event => handlersRef.current.quickNoteSelected(event.payload)),
        listen<string | null>('topnote:quick-note-new', event => handlersRef.current.quickNoteNew(event.payload)),
        listen<{id:string;isNew:boolean}>('topnote:project-saved', event => handlersRef.current.projectSaved(event.payload)),
        listen<{id:string;projectId:string;isNew:boolean}>('topnote:folder-saved', event => handlersRef.current.folderSaved(event.payload)),
        listen<string>('topnote:restore-version', event => handlersRef.current.restoreVersion(event.payload)),
        listen<boolean>('topnote:projects-visible',event => { quickProjectsOpenRef.current = event.payload; setQuickProjectsOpen(event.payload) }),
        listen<string>('topnote:navigate', event => handlersRef.current.navigate(event.payload)),
        listen('topnote:close-requested', () => handlersRef.current.close()),
        listen('topnote:quit-requested', () => { void autosave.flush().then(ok => { if (ok) void api.quit() }) }),
        getCurrentWindow().onResized(event => {
          const currentMode = modeRef.current
          if (currentMode !== 'quick' && currentMode !== 'workspace') return
          clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => {
            if (modeRef.current !== currentMode) return
            void getCurrentWindow().scaleFactor().then(scale => {
              const width = Math.round(event.payload.width / scale)
              const height = Math.round(event.payload.height / scale)
              return Promise.all([
                api.setSetting(`${currentMode === 'quick' ? 'quickPanel' : 'workspace'}Width`, String(width)),
                api.setSetting(`${currentMode === 'quick' ? 'quickPanel' : 'workspace'}Height`, String(height)),
              ])
            }).catch(showError)
          }, 500)
        }),
        getCurrentWebview().onDragDropEvent(event => {
          if (event.payload.type === 'drop' && noteRef.current && event.payload.paths.length) {
            void importPaths(event.payload.paths, noteRef.current.id, true)
          }
        }),
      ])
      if (active) unlisteners.push(...events)
      else events.forEach(stop => stop())
    }
    void register().catch(showError)
    return () => { active = false; clearTimeout(resizeTimer); unlisteners.forEach(stop => stop()) }
  }, [autosave, showError])

  useEffect(() => {
    if (mode === 'quick' && !loading && !onboarding && !noteRef.current && !quickFavorites && !favoritesRequestRef.current) void createNote(true)
  }, [mode, loading, onboarding, quickFavorites])

  useEffect(() => {
    if (settings.autoHide !== 'true') return
    let active = true
    let unlisten: UnlistenFn | undefined
    void getCurrentWindow().onFocusChanged(event => {
      if (!event.payload && modeRef.current === 'quick') setTimeout(() => {
        if (!active || modeRef.current !== 'quick') return
        void api.isAppFocused().then(focused => { if (!focused && active) void setMode('capsule') }).catch(showError)
      }, 180)
    }).then(stop => { if (active) unlisten = stop; else stop() }).catch(showError)
    return () => { active = false; unlisten?.() }
  }, [settings.autoHide, showError])

  async function importPaths(paths: string[], noteId: string, insert = false): Promise<Attachment[]> {
    const imported: Attachment[] = []
    for (const path of paths) {
      try { imported.push(await api.importAttachmentPath(noteId,path)) } catch (failure) { showError(failure) }
    }
    if (noteRef.current?.id === noteId) setAttachments(current => [...current,...imported])
    if (insert && noteRef.current?.id === noteId) {
      const images = imported.filter(item => item.mimeType.startsWith('image/'))
      if (images.length) {
        const document = JSON.parse(noteRef.current.contentJson) as { type: string; content?: unknown[] }
        document.content = [...(document.content ?? []),...images.map(item => ({type:'image',attrs:{src:convertFileSrc(item.path),alt:item.originalName}}))]
        updateNote({contentJson:JSON.stringify(document)})
      }
    }
    return imported
  }

  async function importFiles(files: File[]): Promise<Attachment[]> {
    const current = noteRef.current
    if (!current) return []
    const imported: Attachment[] = []
    for (const file of files) {
      try {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
        imported.push(await api.importAttachment(current.id,file.name || `imagem-${Date.now()}.png`,bytes))
      } catch (failure) { showError(failure) }
    }
    if (noteRef.current?.id === current.id) setAttachments(list => [...list,...imported])
    return imported
  }

  async function pickFiles(images: boolean): Promise<Attachment[]> {
    const current = noteRef.current
    if (!current) return []
    try {
      const selected = await open({ multiple: true, filters: images ? [{ name: 'Imagens', extensions: ['png','jpg','jpeg','gif','webp','bmp'] }] : undefined })
      if (!selected) return []
      return importPaths(Array.isArray(selected) ? selected : [selected],current.id)
    } catch (failure) { showError(failure); return [] }
  }

  function updateNote(changes: Partial<Note>) {
    const current = noteRef.current
    if (!current) return
    const updated = { ...current, ...changes }
    noteRef.current = updated
    setNote(updated)
    autosave.schedule({ id: updated.id, title: updated.title, contentJson: updated.contentJson, contentText: updated.contentText, projectId: updated.projectId, folderId: updated.folderId })
  }

  async function loadNotes(nextView = viewRef.current.view, nextTarget = viewRef.current.targetId) {
    setLoading(true)
    try { setNotes(await api.notes(nextView,nextTarget,0)) }
    catch (failure) { showError(failure) }
    finally { setLoading(false) }
  }
  async function loadMore() {
    if (loading || loadingMore || notes.length === 0 || notes.length % 200 !== 0) return
    setLoadingMore(true)
    try { const more = await api.notes(view,targetId,notes.length); setNotes(current => [...current,...more]) }
    catch (failure) { showError(failure) }
    finally { setLoadingMore(false) }
  }
  async function selectView(nextView: View, nextTarget: string | null = null) {
    if (!(await autosave.flush())) return
    setView(nextView); setTargetId(nextTarget); viewRef.current = { view: nextView, targetId: nextTarget }
    setNote(null); noteRef.current = null; setTags([]); setAttachments([])
    await loadNotes(nextView,nextTarget)
  }
  async function openNote(id: string) {
    if (noteRef.current?.id === id) { setQuickFavorites(false); return }
    if (!(await autosave.flush())) return
    const request = ++navigationRef.current
    try {
      const [loaded,labels,files] = await Promise.all([api.note(id),api.tags(id),api.attachments(id)])
      if (request !== navigationRef.current) return
      noteRef.current = loaded
      setNote(loaded); setTags(labels); setAttachments(files); setSaveStatus('saved'); setQuickFavorites(false)
    } catch (failure) { showError(failure) }
  }
  async function createNote(inbox = false, explicitProjectId?: string | null) {
    if (creatingNoteRef.current) return
    creatingNoteRef.current = true
    try {
      if (!(await autosave.flush())) return
      const context = explicitProjectId !== undefined ? {projectId:explicitProjectId,folderId:null} : inbox ? { projectId:null,folderId:null } : viewRef.current.view === 'project' ? {projectId:viewRef.current.targetId,folderId:null} : viewRef.current.view === 'folder' ? {projectId:folders.find(f => f.id === viewRef.current.targetId)?.projectId ?? null,folderId:viewRef.current.targetId} : {projectId:null,folderId:null}
      const created = await api.newNote(context.projectId,context.folderId)
      noteRef.current = created
      setNote(created); setTags([]); setAttachments([]); setSaveStatus('saved'); setQuickFavorites(false)
      await loadNotes()
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
    finally { creatingNoteRef.current = false }
  }
  async function setMode(next: Mode) {
    if (!(await autosave.flush())) return
    try { await api.setMode(next); modeRef.current = next; setModeState(next) }
    catch (failure) { showError(failure) }
  }
  async function toggleQuickProjects() {
    if (modeRef.current !== 'quick') return
    const next = !quickProjectsOpenRef.current
    try {
      if (next) await api.showProjects(noteRef.current?.projectId ?? null)
      else await api.hideProjects()
    } catch (failure) {
      showError(failure)
    }
  }
  async function selectQuickProject(id: string | null) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      const nextView = id ? 'project' : 'inbox'
      await selectView(nextView,id)
      const choices = await api.notes(nextView,id)
      if (choices.length) await openNote(choices[0].id)
      else await createNote(false)
      await api.hideProjects()
      await getCurrentWindow().setFocus()
    } finally { favoritesRequestRef.current = false }
  }
  async function selectQuickNote({noteId,projectId}: {noteId:string;projectId:string|null}) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      await selectView(projectId ? 'project' : 'inbox',projectId)
      await openNote(noteId)
      await api.hideProjects()
      await getCurrentWindow().setFocus()
    } finally { favoritesRequestRef.current = false }
  }
  async function createQuickNote(projectId: string | null) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      await selectView(projectId ? 'project' : 'inbox',projectId)
      await createNote(false,projectId)
      await api.hideProjects()
      await getCurrentWindow().setFocus()
    } finally { favoritesRequestRef.current = false }
  }
  async function createWorkspaceProjectNote(projectId: string) {
    if (viewRef.current.view !== 'project' || viewRef.current.targetId !== projectId) await selectView('project',projectId)
    setPage('notes')
    setExpanded(current => new Set(current).add(projectId))
    await createNote(false,projectId)
  }
  async function openSidebarProjectNote(noteId: string, projectId: string) {
    if (viewRef.current.view !== 'project' || viewRef.current.targetId !== projectId) await selectView('project',projectId)
    setPage('notes')
    await openNote(noteId)
  }
  async function openWorkspace() { await setMode('workspace'); setPage('notes') }
  async function openSettings() { await setMode('workspace'); setPage('settings') }
  async function showFavorites() {
    favoritesRequestRef.current = true
    try {
      if (modeRef.current !== 'quick') await setMode('quick')
      setQuickFavorites(true)
      setFavoriteNotes(await api.notes('favorites',null,0))
    } catch (failure) { showError(failure) }
    finally { favoritesRequestRef.current = false }
  }
  async function newFromCapsule() {
    favoritesRequestRef.current = true
    try { if (modeRef.current !== 'quick') await setMode('quick'); await createNote(true) }
    finally { favoritesRequestRef.current = false }
  }
  async function closeRequested() {
    if (!(await autosave.flush())) return
    if (settings.trayOnClose === 'false') await api.quit()
    else await setMode('hidden')
  }
  handlersRef.current = {
    navigate: action => { if (action === 'new') void newFromCapsule(); if (action === 'favorites') void showFavorites(); if (action === 'settings') void openSettings(); if (action === 'search') { void setMode(modeRef.current === 'workspace' ? 'workspace' : 'quick').then(() => setPalette('all')) } },
    close: () => { void closeRequested() },
    mode: next => { modeRef.current = next; setModeState(next); if (next !== 'quick') { quickProjectsOpenRef.current = false; setQuickProjectsOpen(false) } },
    requestMode: next => { void setMode(next === 'toggle' ? (modeRef.current === 'quick' ? 'capsule' : 'quick') : next as Mode) },
    projectSelected: id => { void selectQuickProject(id).catch(showError) },
    quickNoteSelected: value => { void selectQuickNote(value).catch(showError) },
    quickNoteNew: id => { void createQuickNote(id).catch(showError) },
    projectSaved: value => { void projectSaved(value).catch(showError) },
    folderSaved: value => { void folderSaved(value).catch(showError) },
    restoreVersion: id => { void restoreVersion(id) },
  }

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && event.key.toLowerCase() === 'k') { event.preventDefault(); if (modeRef.current === 'capsule') void setMode('quick'); setPalette('all') }
      else if (ctrl && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); setDialog({ type:'project' }) }
      else if (ctrl && event.key.toLowerCase() === 'n') { event.preventDefault(); if (modeRef.current === 'quick') void createQuickNote(noteRef.current?.projectId ?? null).catch(showError); else void createNote() }
      else if (ctrl && event.key.toLowerCase() === 'p') { event.preventDefault(); if (modeRef.current === 'quick') void toggleQuickProjects(); else setPalette('projects') }
      else if (ctrl && event.key === 'Enter') { event.preventDefault(); void autosave.flush() }
      else if (event.key === 'Escape' && !palette && !contextMenu && modeRef.current === 'quick' && !event.defaultPrevented) { event.preventDefault(); if (quickProjectsOpenRef.current) void api.hideProjects(); else void setMode('capsule') }
    }
    window.addEventListener('keydown',handle)
    const beforeUnload = () => { void autosave.flush() }
    window.addEventListener('beforeunload',beforeUnload)
    return () => { window.removeEventListener('keydown',handle); window.removeEventListener('beforeunload',beforeUnload) }
  }, [palette,contextMenu,autosave,folders,settings,onboarding])

  function setDialog(value: Dialog) {
    if (!value) { void api.hideDialog().catch(showError); return }
    const id = value.type === 'project' ? value.project?.id : value.type === 'folder' ? value.folder?.id : noteRef.current?.id
    void api.showDialog(value.type,id,value.type === 'folder' ? value.projectId : undefined).catch(showError)
  }
  async function projectSaved({id,isNew}: {id:string;isNew:boolean}) {
    setProjects(await api.projects())
    setExpanded(current => new Set(current).add(id))
    if (isNew) { if (modeRef.current === 'quick') await selectQuickProject(id); else await selectView('project',id) }
  }
  async function folderSaved({id,projectId,isNew}: {id:string;projectId:string;isNew:boolean}) {
    setFolders(await api.folders())
    setExpanded(current => new Set(current).add(projectId))
    if (isNew) await selectView('folder',id)
  }
  async function projectAction(id: string, action: string) {
    try { await api.projectState(id,action); setProjects(await api.projects()); await emit('topnote:projects-changed'); setContextMenu(null); if (targetId === id) await selectView('inbox') }
    catch (failure) { showError(failure) }
  }
  async function folderAction(id: string, deleted: boolean) {
    try { await api.folderState(id,deleted); setFolders(await api.folders()); setContextMenu(null); if (targetId === id) await selectView('inbox') }
    catch (failure) { showError(failure) }
  }
  async function moveNote(id: string, projectId: string | null, folderId: string | null) {
    if (!(await autosave.flush())) return
    try {
      const current = noteRef.current?.id === id ? noteRef.current : await api.note(id)
      const saved = await api.saveNote({ id, title:current.title, contentJson:current.contentJson, contentText:current.contentText, projectId, folderId })
      if (noteRef.current?.id === id) { noteRef.current = saved; setNote(saved) }
      await loadNotes(); notify('Nota movida')
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
  }
  async function noteAction(id: string, action: string) {
    if (!(await autosave.flush())) return
    try {
      await api.noteState(id,action)
      setContextMenu(null)
      if (noteRef.current?.id === id) {
        if (['delete','archive','permanent'].includes(action)) { noteRef.current = null; setNote(null); setAttachments([]); setTags([]) }
        else { const updated = await api.note(id); noteRef.current = updated; setNote(updated) }
      }
      await loadNotes()
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
  }
  async function duplicateNote(id: string) {
    if (!(await autosave.flush())) return
    try {
      const original = noteRef.current?.id === id ? noteRef.current : await api.note(id)
      const copy = await api.newNote(original.projectId,original.folderId)
      let contentJson = original.contentJson
      for (const item of await api.attachments(id)) {
        const clone = await api.importAttachmentPath(copy.id,item.path)
        contentJson = contentJson.replaceAll(convertFileSrc(item.path),convertFileSrc(clone.path))
      }
      await api.saveNote({id:copy.id,title:`${original.title || 'Sem título'} (cópia)`,contentJson,contentText:original.contentText,projectId:copy.projectId,folderId:copy.folderId})
      await api.setTags(copy.id,await api.tags(id))
      await loadNotes(); await openNote(copy.id); setContextMenu(null)
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
  }
  async function setNoteTags(names: string[]) {
    const current = noteRef.current
    if (!current) return
    try { await api.setTags(current.id,names); setTags(await api.tags(current.id)) }
    catch (failure) { showError(failure) }
  }
  async function removeAttachment(item: Attachment) {
    try {
      await api.deleteAttachment(item.id)
      setAttachments(current => current.filter(a => a.id !== item.id))
      const current = noteRef.current
      if (current && item.mimeType.startsWith('image/')) updateNote({ contentJson:removeImage(current.contentJson,convertFileSrc(item.path)) })
    } catch (failure) { showError(failure) }
  }
  async function reorderProjects(source: string, target: string) {
    const ids = projects.map(p => p.id)
    const from = ids.indexOf(source), to = ids.indexOf(target)
    if (from < 0 || to < 0) return
    ids.splice(to,0,ids.splice(from,1)[0])
    try { await api.reorderProjects(ids); setProjects(await api.projects()) } catch (failure) { showError(failure) }
  }
  async function reorderFolders(source: string, target: string) {
    const origin = folders.find(f => f.id === source), destination = folders.find(f => f.id === target)
    if (!origin || !destination || origin.projectId !== destination.projectId) return
    const ids = folders.filter(f => f.projectId === origin.projectId).map(f => f.id)
    ids.splice(ids.indexOf(target),0,ids.splice(ids.indexOf(source),1)[0])
    try { await api.reorderFolders(ids); setFolders(await api.folders()) } catch (failure) { showError(failure) }
  }
  async function setSetting(key: string, value: string) {
    try {
      await api.setSetting(key,value)
      setSettings(current => ({...current,[key]:value}))
      if (key === 'alwaysOnTop') await api.setMode(modeRef.current)
    } catch (failure) { showError(failure); throw failure }
  }
  async function backup() {
    try {
      const path = await save({ defaultPath:'topnote-backup.zip', filters:[{name:'Backup TopNote',extensions:['zip']}] })
      if (!path) return
      if (!(await autosave.flush())) return
      await api.backup(path)
      notify('Backup criado com sucesso')
    } catch (failure) { showError(failure) }
  }
  async function exportProject(project: Project) {
    try {
      const path = await save({defaultPath:`${project.name.replace(/[<>:"/\\|?*]/g,'_')}.zip`,filters:[{name:'Projeto TopNote',extensions:['zip']}]})
      if (!path) return
      if (!(await autosave.flush())) return
      await api.exportProject(project.id,path)
      setContextMenu(null); notify('Projeto exportado')
    } catch (failure) { showError(failure) }
  }
  async function restore() {
    try {
      const path = await open({ filters:[{name:'Backup TopNote',extensions:['zip']}] })
      if (!path || Array.isArray(path)) return
      if (!window.confirm('Restaurar este backup substituirá as notas e anexos atuais. Deseja continuar?')) return
      if (!(await autosave.flush())) return
      await api.restoreBackup(path)
      window.location.reload()
    } catch (failure) { showError(failure) }
  }
  async function exportNote(id: string) {
    if (!(await autosave.flush())) return
    try {
      const current = noteRef.current?.id === id ? noteRef.current : await api.note(id)
      const choice = window.prompt('Formato da exportação: md, txt, json ou html', 'md')?.trim().toLowerCase()
      if (!choice) return
      if (!['md','txt','json','html'].includes(choice)) { showError('Formato inválido. Escolha md, txt, json ou html.'); return }
      const path = await save({ defaultPath:`${(current.title || 'nota').replace(/[<>:"/\\|?*]/g,'_')}.${choice}`, filters:[{name:choice.toUpperCase(),extensions:[choice]}] })
      if (!path) return
      const content = choice === 'txt' ? current.contentText : choice === 'json' ? JSON.stringify({title:current.title,content:JSON.parse(current.contentJson),createdAt:current.createdAt,updatedAt:current.updatedAt},null,2) : choice === 'html' ? toHtml(current.title,current.contentJson) : `# ${current.title || 'Sem título'}\n\n${toMarkdown(current.contentJson)}`
      await api.exportFile(path,content)
      notify('Nota exportada')
    } catch (failure) { showError(failure) }
  }
  async function importNote() {
    try {
      const path = await open({ filters:[{name:'Texto ou Markdown',extensions:['txt','md']}] })
      if (!path || Array.isArray(path)) return
      const imported = await api.importText(path,view === 'project' ? targetId : null)
      await loadNotes(); await openNote(imported.id); notify('Nota importada')
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
  }
  async function showVersions() {
    const current = noteRef.current
    if (!current) return
    if (!(await autosave.flush())) return
    try { await api.showDialog('versions',current.id) }
    catch (failure) { showError(failure) }
  }
  async function restoreVersion(id: string) {
    if (!(await autosave.flush())) return
    try { const restored = await api.restoreVersion(id); noteRef.current = restored; setNote(restored); await api.hideDialog(); await loadNotes(); notify('Versão restaurada') }
    catch (failure) { showError(failure) }
  }
  async function finishOnboarding(example: boolean) {
    try {
      await setSetting('onboardingDone','true')
      if (example) {
        const project = await api.upsertProject({name:'Meu primeiro projeto',description:'Um lugar para organizar ideias e tarefas.',color:'#5B8DEF',icon:'folder'})
        setProjects(await api.projects())
        const sample = await api.newNote(project.id,null)
        await api.saveNote({id:sample.id,title:'Bem-vindo ao TopNote',contentJson:JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Capture uma ideia usando Ctrl + Shift + Space. Depois, organize suas notas por aqui.'}]}]}),contentText:'Capture uma ideia usando Ctrl + Shift + Space. Depois, organize suas notas por aqui.',projectId:project.id,folderId:null})
      }
      setOnboarding(false); await setMode('capsule')
    } catch (failure) { showError(failure) }
  }

  const title = view === 'project' ? projects.find(p => p.id === targetId)?.name ?? 'Projeto' : view === 'folder' ? folders.find(f => f.id === targetId)?.name ?? 'Pasta' : ({inbox:'Inbox',favorites:'Favoritos',recent:'Recentes',all:'Todas as notas',archive:'Arquivo',trash:'Lixeira'} as Record<string,string>)[view]
  const paletteCommands: PaletteCommand[] = [
    {label:'Nova nota',detail:'Ctrl + N',icon:FilePlus2,run:() => modeRef.current === 'quick' ? createQuickNote(noteRef.current?.projectId ?? null) : createNote()},
    {label:'Novo projeto',detail:'Ctrl + Shift + N',icon:FolderPlus,run:() => setDialog({type:'project'})},
    {label:'Abrir Workspace',icon:LayoutDashboard,run:openWorkspace},
    {label:'Pesquisar notas',detail:'Busque título, conteúdo, projeto, pasta e tags',icon:Search,run:() => setPalette('all')},
    {label:'Adicionar imagem',icon:Plus,run:() => { void pickFiles(true) }},
    {label:'Importar TXT ou Markdown',icon:Import,run:importNote},
    {label:'Exportar nota',icon:Download,run:() => { if (noteRef.current) void exportNote(noteRef.current.id) }},
    {label:'Criar backup',icon:Archive,run:backup},
    {label:'Configurações',icon:Settings2,run:openSettings},
    ...projects.filter(p => !p.isDeleted && !p.isArchived).map(p => ({label:`Abrir projeto: ${p.name}`,detail:'Projeto',icon:FolderPlus,run:() => { void openWorkspace().then(() => selectView('project',p.id)) }})),
  ].filter(item => palette !== 'projects' || item.label.startsWith('Abrir projeto:'))

  const detailProps = note ? { note, projects, folders, tags, attachments, status:saveStatus, onUpdate:updateNote, onFiles:importFiles, onPick:pickFiles, onTags:setNoteTags, onRemoveAttachment:removeAttachment, onState:(action:string) => noteAction(note.id,action), onWorkspace:() => { void openWorkspace() }, onCapsule:() => { void setMode('capsule') }, onSearch:() => setPalette('all'), onSettings:() => { void openSettings() }, onVersions:() => { void showVersions() }, onExport:() => { void exportNote(note.id) }, onRetry:() => { void autosave.flush() } } : null

  return <div className={`app app-${mode}`}>
    {(mode === 'quick' || mode === 'workspace') && <ResizeHandles minWidth={mode === 'workspace' ? 780 : 420} minHeight={mode === 'workspace' ? 520 : 340}/>}
    {mode === 'quick' && <div className="quick-stage"><div className="quick-panel">{onboarding ? <Onboarding onFinish={finishOnboarding}/> : quickFavorites ? <div className="quick-favorites"><div className="quick-favorites-head"><button className="icon-button" onClick={() => setQuickFavorites(false)}><ArrowLeft size={18}/></button><Star size={17}/>Favoritos<button className="icon-button quick-favorites-close" onClick={() => { void setMode('capsule') }}><X size={18}/></button></div><div className="quick-favorites-list">{favoriteNotes.length === 0 ? <div className="quick-favorites-empty">Nenhuma nota fixada ainda.</div> : favoriteNotes.map(item => <button key={item.id} onClick={() => { void openNote(item.id) }}><strong>{item.title || 'Sem título'}</strong><span>{item.preview || formatDate(item.updatedAt)}</span></button>)}</div><button className="quick-favorites-workspace" onClick={() => { void openWorkspace() }}>Abrir Workspace</button></div> : detailProps ? <NoteDetail {...detailProps} compact projectsOpen={quickProjectsOpen} onToggleProjects={() => { void toggleQuickProjects() }} onNewQuickNote={() => { void createQuickNote(noteRef.current?.projectId ?? null).catch(showError) }}/> : <div className="quick-loading"><BrandIcon/><p>{loading ? 'Carregando…' : 'Preparando nota…'}</p><button className="primary-button" onClick={() => { void createNote(true) }}>Nova nota</button></div>}</div></div>}
    {mode === 'workspace' && <header className="workspace-titlebar" {...workspaceDrag.bind}><span><FileText size={16}/>TopNote · Workspace</span><button onClick={() => { void setMode('capsule') }}><ChevronUp size={16}/> Recolher</button></header>}
    {mode === 'workspace' && <div className="workspace-shell"><Sidebar projects={projects} folders={folders} view={view} targetId={targetId} expanded={expanded} onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onSelect={(next,target) => { setPage('notes'); void selectView(next,target ?? null) }} onNewProject={() => setDialog({type:'project'})} activeNote={note} notesRevision={notesRevision} onSelectNote={(noteId,projectId) => { void openSidebarProjectNote(noteId,projectId) }} onNewNote={projectId => { void createWorkspaceProjectNote(projectId) }} onProjectMenu={(project,x,y) => setContextMenu({type:'project',project,x,y})} onFolderMenu={(folder,x,y) => setContextMenu({type:'folder',folder,x,y})} onMoveNote={(id,projectId,folderId) => { void moveNote(id,projectId,folderId) }} onReorderProjects={(source,target) => { void reorderProjects(source,target) }} onReorderFolders={(source,target) => { void reorderFolders(source,target) }}/>
      {page === 'settings' ? <Settings settings={settings} dataPath={dataPath} onSet={setSetting} onBackup={backup} onRestore={restore} onBack={() => setPage('notes')}/> : <><NoteList title={title} view={view} notes={notes} selectedId={note?.id ?? null} loading={loading} onSelect={id => { void openNote(id) }} onNew={() => { void createNote() }} onSearch={() => setPalette('all')} onMenu={(item,x,y) => setContextMenu({type:'note',note:item,x,y})} onEmptyTrash={() => { if (window.confirm('Excluir permanentemente todas as notas da lixeira?')) void api.emptyTrash().then(() => loadNotes()).catch(showError) }} onLoadMore={() => { void loadMore() }}/>{detailProps ? <NoteDetail {...detailProps} compact={false}/> : <div className="workspace-empty"><div className="workspace-empty-art"><BrandIcon/></div><div className="eyebrow">Seu espaço de ideias</div><h2>Suas notas, em foco.</h2><p>Selecione uma nota na lista ou crie uma nova para começar.</p><button className="primary-button" onClick={() => { void createNote() }}><Plus size={16}/>Nova nota</button><div className="empty-shortcut"><Keyboard size={14}/>Ctrl + Shift + Space para capturar rapidamente</div></div>}</>}
    </div>}
    {palette && <CommandPalette commands={paletteCommands} onOpenNote={id => { void openNote(id) }} onClose={() => setPalette(null)}/>}



    {contextMenu && <div className="context-cover" onClick={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu(null) }}><div className="context-menu" style={{left:Math.min(contextMenu.x,window.innerWidth-210),top:Math.min(contextMenu.y,window.innerHeight-330)}} onClick={event => event.stopPropagation()}>
      {contextMenu.type === 'note' ? <><button onClick={() => { void openNote(contextMenu.note.id); setContextMenu(null) }}>Abrir</button><button onClick={() => { void noteAction(contextMenu.note.id,contextMenu.note.isPinned ? 'unpin' : 'pin') }}>{contextMenu.note.isPinned ? 'Desafixar' : 'Fixar'}</button>{!contextMenu.note.isDeleted && <><div className="context-label">Mover para</div><button onClick={() => { void moveNote(contextMenu.note.id,null,null); setContextMenu(null) }}>Inbox</button>{projects.filter(p => !p.isDeleted && !p.isArchived).map(project => <button key={project.id} onClick={() => { void moveNote(contextMenu.note.id,project.id,null); setContextMenu(null) }}>{project.name}</button>)}</>}<button onClick={() => { void duplicateNote(contextMenu.note.id) }}>Duplicar</button><button onClick={() => { void exportNote(contextMenu.note.id); setContextMenu(null) }}>Exportar</button>{contextMenu.note.isDeleted ? <><button onClick={() => { void noteAction(contextMenu.note.id,'restore') }}>Restaurar</button><button className="danger" onClick={() => { if (window.confirm('Excluir esta nota permanentemente?')) void noteAction(contextMenu.note.id,'permanent') }}>Excluir permanentemente</button></> : <><button onClick={() => { void noteAction(contextMenu.note.id,contextMenu.note.isArchived ? 'unarchive' : 'archive') }}>{contextMenu.note.isArchived ? 'Desarquivar' : 'Arquivar'}</button><button className="danger" onClick={() => { void noteAction(contextMenu.note.id,'delete') }}>Mover para lixeira</button></>}</> : contextMenu.type === 'project' ? <><button onClick={() => { setDialog({type:'folder',projectId:contextMenu.project.id}); setContextMenu(null) }}>Nova pasta</button><button onClick={() => { setDialog({type:'project',project:contextMenu.project}); setContextMenu(null) }}>Editar projeto</button><button onClick={() => { void exportProject(contextMenu.project) }}>Exportar projeto</button>{contextMenu.project.isArchived && !contextMenu.project.isDeleted ? <button onClick={() => { void projectAction(contextMenu.project.id,'unarchive') }}>Desarquivar</button> : !contextMenu.project.isDeleted && <button onClick={() => { void projectAction(contextMenu.project.id,'archive') }}>Arquivar</button>}{contextMenu.project.isDeleted ? <button onClick={() => { void projectAction(contextMenu.project.id,'restore') }}>Restaurar</button> : <button className="danger" onClick={() => { void projectAction(contextMenu.project.id,'delete') }}>Excluir</button>}</> : <><button onClick={() => { setDialog({type:'folder',projectId:contextMenu.folder.projectId,folder:contextMenu.folder}); setContextMenu(null) }}>Renomear pasta</button><button className="danger" onClick={() => { void folderAction(contextMenu.folder.id,true) }}>Excluir pasta</button></>}
    </div></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { void autosave.flush(); setError('') }}>Tentar novamente</button><button aria-label="Fechar erro" onClick={() => setError('')}><X size={16}/></button></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
