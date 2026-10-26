import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { convertFileSrc } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Archive, ArrowLeft, ChevronUp, Download, FilePlus2, FileText, FolderPlus, Import, Keyboard, LayoutDashboard, Plus, Search, Settings2, Star, X } from 'lucide-react'
import type { Attachment, Folder, Mode, Note, NoteSummary, Project, SaveStatus, Settings as SettingsType, View } from './types'
import { api } from './services/api'
import { Autosave } from './services/autosave'
import { formatDate, removeImage, toMarkdown } from './services/format'
import { BrandIcon } from './components/BrandIcon'
import { loadEditor, NoteDetail } from './components/NoteDetail'
import type { PaletteCommand } from './components/CommandPalette'
import { ResizeHandles } from './components/ResizeHandles'
import { ProjectsSheet } from './components/ProjectsSheet'
import { DialogHost, type DialogRequest } from './components/DialogHost'
import { useAppearance } from './hooks/useAppearance'
import { isWindowHeader, useWindowDrag } from './hooks/useWindowDrag'
import { usePanelMotion } from './hooks/usePanelMotion'

// The quick editor is what opens most; everything else loads the first time it is needed.
const Sidebar = lazy(() => import('./components/Sidebar').then(module => ({default:module.Sidebar})))
const NoteList = lazy(() => import('./components/NoteList').then(module => ({default:module.NoteList})))
const Settings = lazy(() => import('./components/Settings').then(module => ({default:module.Settings})))
const CommandPalette = lazy(() => import('./components/CommandPalette').then(module => ({default:module.CommandPalette})))
const Onboarding = lazy(() => import('./components/Onboarding').then(module => ({default:module.Onboarding})))

type Dialog = { type: 'project'; project?: Project } | { type: 'folder'; projectId: string; folder?: Folder } | { type: 'versions' } | null
type ContextMenu = { type: 'note'; note: NoteSummary; x: number; y: number } | { type: 'project'; project: Project; x: number; y: number } | { type: 'folder'; folder: Folder; x: number; y: number } | null

export default function App() {
  useAppearance()
  const workspaceDrag = useWindowDrag(isWindowHeader)
  const [mode, setModeState] = useState<Mode>('capsule')
  const panelMotion = usePanelMotion()
  // The panel stays mounted between openings, so focus the note each time it opens.
  useEffect(() => {
    if (mode !== 'quick') return
    const timer = setTimeout(() => {
      const editor = document.querySelector<HTMLElement>('.quick-panel .ProseMirror')
      const active = document.activeElement
      if (!editor || editor.contains(active) || active?.matches('input, textarea, select')) return
      editor.focus()
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(range)
    }, 20)
    return () => clearTimeout(timer)
  }, [mode])
  const [page, setPage] = useState<'notes' | 'settings'>('notes')
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [view, setView] = useState<View>('all')
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
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null)
  const [favoriteNotes, setFavoriteNotes] = useState<NoteSummary[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const favoritesRequestRef = useRef(false)
  const creatingNoteRef = useRef(false)
  const navigationRef = useRef(0)
  const noteRef = useRef<Note | null>(null)
  const modeRef = useRef<Mode>(mode)
  const modeQueueRef = useRef(Promise.resolve())
  const initialLoad = useRef<{ done: Promise<void>; finish: () => void } | null>(null)
  if (!initialLoad.current) { let finish = () => {}; const done = new Promise<void>(resolve => { finish = resolve }); initialLoad.current = { done, finish } }
  const viewRef = useRef({ view, targetId })
  noteRef.current = note
  modeRef.current = mode
  viewRef.current = { view, targetId }
  const handlersRef = useRef({} as { navigate: (action: string) => void; close: () => void; quit: () => void; mode: (next: Mode) => void; requestMode: (next: string) => void })
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
    // The editor chunk loads alongside the first queries, so the panel never shows it arriving late.
    void Promise.all([api.settings(),api.projects(),api.folders(),api.notes('all',null,0),api.dataDirectory(),api.mode(),loadEditor()]).then(async ([preferences,allProjects,allFolders,allNotes,path,currentMode]) => {
      let previous: Note | null = null
      for (const id of [...new Set([preferences.lastNoteId,allNotes[0]?.id].filter((id): id is string => Boolean(id)))]) {
        const candidate = await api.note(id).catch(() => null)
        if (candidate && !candidate.isDeleted && !candidate.isArchived) { previous = candidate; break }
      }
      const previousView: View = previous?.folderId ? 'folder' : previous?.projectId ? 'project' : 'all'
      const previousTarget = previous?.folderId ?? previous?.projectId ?? null
      const [initialNotes,initialTags,initialFiles] = await Promise.all([
        previousView === 'all' ? Promise.resolve(allNotes) : api.notes(previousView,previousTarget),
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
    }).catch(showError).finally(() => initialLoad.current!.finish())
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
        listen<string>('topnote:navigate', event => handlersRef.current.navigate(event.payload)),
        listen('topnote:close-requested', () => handlersRef.current.close()),
        listen('topnote:quit-requested', () => handlersRef.current.quit()),
        getCurrentWindow().onResized(event => {
          const currentMode = modeRef.current
          clearTimeout(resizeTimer)
          if (currentMode !== 'quick' && currentMode !== 'workspace') return
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
      if (!active) { events.forEach(stop => stop()); return }
      unlisteners.push(...events)
      // Events sent while this page was unloaded or starting (the capsule click that woke it,
      // the hotkey) wait in Rust until the notes are loaded and the listeners are in place.
      await initialLoad.current!.done
      if (!active) return
      for (const { event, payload } of await api.mainReady()) {
        if (event === 'topnote:request-mode') handlersRef.current.requestMode(payload)
        else if (event === 'topnote:navigate') handlersRef.current.navigate(payload)
        else if (event === 'topnote:close-requested') handlersRef.current.close()
        else if (event === 'topnote:quit-requested') handlersRef.current.quit()
      }
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
  async function createNote(unfiled = false, explicitProjectId?: string | null) {
    if (creatingNoteRef.current) return
    creatingNoteRef.current = true
    try {
      if (!(await autosave.flush())) return
      const context = explicitProjectId !== undefined ? {projectId:explicitProjectId,folderId:null} : unfiled ? { projectId:null,folderId:null } : viewRef.current.view === 'project' ? {projectId:viewRef.current.targetId,folderId:null} : viewRef.current.view === 'folder' ? {projectId:folders.find(f => f.id === viewRef.current.targetId)?.projectId ?? null,folderId:viewRef.current.targetId} : {projectId:null,folderId:null}
      const created = await api.newNote(context.projectId,context.folderId)
      noteRef.current = created
      setNote(created); setTags([]); setAttachments([]); setSaveStatus('saved'); setQuickFavorites(false)
      await loadNotes()
      setNotesRevision(current => current + 1)
    } catch (failure) { showError(failure) }
    finally { creatingNoteRef.current = false }
  }
  /** Mode changes run one at a time, so a toggle pressed mid-animation applies after it. */
  function setMode(next: Mode | 'toggle') {
    const run = modeQueueRef.current.then(() => applyMode(next === 'toggle' ? (modeRef.current === 'quick' ? 'capsule' : 'quick') : next))
    modeQueueRef.current = run.catch(() => {})
    return run
  }
  async function applyMode(next: Mode) {
    const previous = modeRef.current
    const animate = document.documentElement.dataset.motion !== 'reduced'
    const folding = previous === 'quick' && next === 'capsule' && animate
    // Saving and asking where the capsule is go out together, so the fold starts after one round trip.
    const [saved, foldAnchor] = await Promise.all([autosave.flush(), folding ? api.motionAnchor().catch(() => null) : null])
    if (!saved) return
    try {
      if (next === 'capsule' || next === 'hidden') {
        setQuickProjectsOpen(false)
        // Fold back into the capsule, or at least leave a clear frame behind for the next show.
        if (folding) await panelMotion.close(foldAnchor)
        else if (previous === 'quick' || previous === 'workspace') await panelMotion.conceal()
        await api.setMode(next)
        modeRef.current = next; setModeState(next)
        return
      }
      const entering = next === 'quick' && (previous === 'capsule' || previous === 'hidden')
      if (entering && animate) panelMotion.prepare()
      const anchor = await api.setMode(next, entering && animate)
      // Commit the mode now (not on React's schedule), so the panel is laid out before anything moves.
      modeRef.current = next; flushSync(() => setModeState(next))
      // The quick panel is shown without focus, so it can appear at once; focus follows.
      const activate = () => { if (next === 'quick') void api.activateWindow().catch(showError) }
      if (!anchor) { panelMotion.reset(); activate(); return }
      // The window just became visible: let it paint the hidden panel once, so the entrance never waits on a raster.
      await panelMotion.warm()
      // The window is already at its final size; only the panel grows out of the capsule.
      void panelMotion.open(anchor).catch(showError)
      activate()
    } catch (failure) { panelMotion.reset(); showError(failure) }
  }
  function toggleQuickProjects() {
    if (modeRef.current === 'quick') setQuickProjectsOpen(open => !open)
  }
  async function selectQuickProject(id: string | null) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      const nextView = id ? 'project' : 'all'
      await selectView(nextView,id)
      const choices = await api.notes(nextView,id)
      if (choices.length) await openNote(choices[0].id)
      else await createNote(false)
      setQuickProjectsOpen(false)
    } finally { favoritesRequestRef.current = false }
  }
  async function selectQuickNote({noteId,projectId}: {noteId:string;projectId:string|null}) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      await selectView(projectId ? 'project' : 'all',projectId)
      await openNote(noteId)
      setQuickProjectsOpen(false)
    } finally { favoritesRequestRef.current = false }
  }
  async function createQuickNote(projectId: string | null) {
    if (!(await autosave.flush())) return
    favoritesRequestRef.current = true
    try {
      await selectView(projectId ? 'project' : 'all',projectId)
      await createNote(false,projectId)
      setQuickProjectsOpen(false)
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
    quit: () => { void autosave.flush().then(ok => { if (ok) void api.quit() }) },
    mode: next => { modeRef.current = next; setModeState(next); if (next !== 'quick') setQuickProjectsOpen(false) },
    requestMode: next => { void setMode(next as Mode | 'toggle') },
  }

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && event.key.toLowerCase() === 'k') { event.preventDefault(); if (modeRef.current === 'capsule') void setMode('quick'); setPalette('all') }
      else if (ctrl && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); setDialog({ type:'project' }) }
      else if (ctrl && event.key.toLowerCase() === 'n') { event.preventDefault(); if (modeRef.current === 'quick') void createQuickNote(noteRef.current?.projectId ?? null).catch(showError); else void createNote() }
      else if (ctrl && event.key.toLowerCase() === 'p') { event.preventDefault(); if (modeRef.current === 'quick') toggleQuickProjects(); else setPalette('projects') }
      else if (ctrl && event.key === 'Enter') { event.preventDefault(); void autosave.flush() }
      // The projects sheet and dialogs handle their own Escape first.
      else if (event.key === 'Escape' && !palette && !contextMenu && modeRef.current === 'quick' && !event.defaultPrevented) { event.preventDefault(); void setMode('capsule') }
    }
    window.addEventListener('keydown',handle)
    const beforeUnload = () => { void autosave.flush() }
    window.addEventListener('beforeunload',beforeUnload)
    return () => { window.removeEventListener('keydown',handle); window.removeEventListener('beforeunload',beforeUnload) }
  }, [palette,contextMenu,autosave,folders,settings,onboarding])

  const closeDialog = useCallback(() => setDialogRequest(null), [])
  const closeQuickProjects = useCallback(() => setQuickProjectsOpen(false), [])
  function setDialog(value: Dialog) {
    if (!value) { setDialogRequest(null); return }
    const id = value.type === 'project' ? value.project?.id : value.type === 'folder' ? value.folder?.id : noteRef.current?.id
    setDialogRequest({ key: Date.now(), kind: value.type, id: id ?? null, projectId: value.type === 'folder' ? value.projectId : null })
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
    try { await api.projectState(id,action); setProjects(await api.projects()); setContextMenu(null); if (targetId === id) await selectView('all') }
    catch (failure) { showError(failure) }
  }
  async function folderAction(id: string, deleted: boolean) {
    try { await api.folderState(id,deleted); setFolders(await api.folders()); setContextMenu(null); if (targetId === id) await selectView('all') }
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
      const content = choice === 'txt' ? current.contentText : choice === 'json' ? JSON.stringify({title:current.title,content:JSON.parse(current.contentJson),createdAt:current.createdAt,updatedAt:current.updatedAt},null,2) : choice === 'html' ? (await import('./services/export')).toHtml(current.title,current.contentJson) : `# ${current.title || 'Sem título'}\n\n${toMarkdown(current.contentJson)}`
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
    setDialog({ type:'versions' })
  }
  async function restoreVersion(id: string) {
    if (!(await autosave.flush())) return
    try { const restored = await api.restoreVersion(id); noteRef.current = restored; setNote(restored); setDialogRequest(null); await loadNotes(); notify('Versão restaurada') }
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

  const title = view === 'project' ? projects.find(p => p.id === targetId)?.name ?? 'Projeto' : view === 'folder' ? folders.find(f => f.id === targetId)?.name ?? 'Pasta' : ({favorites:'Favoritos',recent:'Recentes',all:'Todas as notas',archive:'Arquivo',trash:'Lixeira'} as Record<string,string>)[view]
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

  // data-window-motion is driven imperatively by usePanelMotion; React never renders it.
  return <div ref={panelMotion.app} className={`app app-${mode}`}>
    {(mode === 'quick' || mode === 'workspace') && <ResizeHandles/>}
    {(mode === 'quick' || mode === 'capsule' || mode === 'hidden') && <div className="quick-stage"><div ref={panelMotion.panel} className="quick-panel">{onboarding ? <Suspense fallback={null}><Onboarding onFinish={finishOnboarding}/></Suspense> : quickFavorites ? <div className="quick-favorites"><div className="quick-favorites-head"><button className="icon-button" onClick={() => setQuickFavorites(false)}><ArrowLeft size={18}/></button><Star size={17}/>Favoritos<button className="icon-button quick-favorites-close" onClick={() => { void setMode('capsule') }}><X size={18}/></button></div><div className="quick-favorites-list">{favoriteNotes.length === 0 ? <div className="quick-favorites-empty">Nenhuma nota fixada ainda.</div> : favoriteNotes.map(item => <button key={item.id} onClick={() => { void openNote(item.id) }}><strong>{item.title || 'Sem título'}</strong><span>{item.preview || formatDate(item.updatedAt)}</span></button>)}</div><button className="quick-favorites-workspace" onClick={() => { void openWorkspace() }}>Abrir Workspace</button></div> : detailProps ? <NoteDetail {...detailProps} compact projectsOpen={quickProjectsOpen} onToggleProjects={toggleQuickProjects} onNewQuickNote={() => { void createQuickNote(noteRef.current?.projectId ?? null).catch(showError) }}/> : <div className="quick-loading"><BrandIcon/><p>{loading ? 'Carregando…' : 'Preparando nota…'}</p><button className="primary-button" onClick={() => { void createNote(true) }}>Nova nota</button></div>}
      {quickProjectsOpen && mode === 'quick' && <ProjectsSheet projects={projects} selectedId={noteRef.current?.projectId ?? null} onClose={closeQuickProjects} onOpenNote={item => { void selectQuickNote({noteId:item.id,projectId:item.projectId}).catch(showError) }} onNewNote={id => { void createQuickNote(id).catch(showError) }} onNewProject={() => setDialog({type:'project'})} onEditProject={project => setDialog({type:'project',project})}/>}
    </div></div>}
    {mode === 'workspace' && <header className="workspace-titlebar" {...workspaceDrag.bind}><span><FileText size={16}/>TopNote · Workspace</span><button onClick={() => { void setMode('capsule') }}><ChevronUp size={16}/> Recolher</button></header>}
    {mode === 'workspace' && <Suspense fallback={null}><div className="workspace-shell"><Sidebar projects={projects} folders={folders} view={view} targetId={targetId} expanded={expanded} onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onSelect={(next,target) => { setPage('notes'); void selectView(next,target ?? null) }} onNewProject={() => setDialog({type:'project'})} activeNote={note} notesRevision={notesRevision} onSelectNote={(noteId,projectId) => { void openSidebarProjectNote(noteId,projectId) }} onNewNote={projectId => { void createWorkspaceProjectNote(projectId) }} onProjectMenu={(project,x,y) => setContextMenu({type:'project',project,x,y})} onFolderMenu={(folder,x,y) => setContextMenu({type:'folder',folder,x,y})} onMoveNote={(id,projectId,folderId) => { void moveNote(id,projectId,folderId) }} onReorderProjects={(source,target) => { void reorderProjects(source,target) }} onReorderFolders={(source,target) => { void reorderFolders(source,target) }}/>
      {page === 'settings' ? <Settings settings={settings} dataPath={dataPath} onSet={setSetting} onBackup={backup} onRestore={restore} onBack={() => setPage('notes')}/> : <><NoteList title={title} view={view} notes={notes} selectedId={note?.id ?? null} loading={loading} onSelect={id => { void openNote(id) }} onNew={() => { void createNote() }} onSearch={() => setPalette('all')} onMenu={(item,x,y) => setContextMenu({type:'note',note:item,x,y})} onEmptyTrash={() => { if (window.confirm('Excluir permanentemente todas as notas da lixeira?')) void api.emptyTrash().then(() => loadNotes()).catch(showError) }} onLoadMore={() => { void loadMore() }}/>{detailProps ? <NoteDetail {...detailProps} compact={false}/> : <div className="workspace-empty"><div className="workspace-empty-art"><BrandIcon/></div><div className="eyebrow">Seu espaço de ideias</div><h2>Suas notas, em foco.</h2><p>Selecione uma nota na lista ou crie uma nova para começar.</p><button className="primary-button" onClick={() => { void createNote() }}><Plus size={16}/>Nova nota</button><div className="empty-shortcut"><Keyboard size={14}/>Ctrl + Shift + Space para capturar rapidamente</div></div>}</>}
    </div></Suspense>}
    {palette && <Suspense fallback={null}><CommandPalette commands={paletteCommands} onOpenNote={id => { void openNote(id) }} onClose={() => setPalette(null)}/></Suspense>}
    {dialogRequest && <DialogHost request={dialogRequest} onClose={closeDialog} onProjectSaved={value => { void projectSaved(value).catch(showError) }} onFolderSaved={value => { void folderSaved(value).catch(showError) }} onRestoreVersion={id => { void restoreVersion(id) }}/>}



    {contextMenu && <div className="context-cover" onClick={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu(null) }}><div className="context-menu" style={{left:Math.min(contextMenu.x,window.innerWidth-210),top:Math.min(contextMenu.y,window.innerHeight-330)}} onClick={event => event.stopPropagation()}>
      {contextMenu.type === 'note' ? <><button onClick={() => { void openNote(contextMenu.note.id); setContextMenu(null) }}>Abrir</button><button onClick={() => { void noteAction(contextMenu.note.id,contextMenu.note.isPinned ? 'unpin' : 'pin') }}>{contextMenu.note.isPinned ? 'Desafixar' : 'Fixar'}</button>{!contextMenu.note.isDeleted && <><div className="context-label">Mover para</div><button onClick={() => { void moveNote(contextMenu.note.id,null,null); setContextMenu(null) }}>Sem projeto</button>{projects.filter(p => !p.isDeleted && !p.isArchived).map(project => <button key={project.id} onClick={() => { void moveNote(contextMenu.note.id,project.id,null); setContextMenu(null) }}>{project.name}</button>)}</>}<button onClick={() => { void duplicateNote(contextMenu.note.id) }}>Duplicar</button><button onClick={() => { void exportNote(contextMenu.note.id); setContextMenu(null) }}>Exportar</button>{contextMenu.note.isDeleted ? <><button onClick={() => { void noteAction(contextMenu.note.id,'restore') }}>Restaurar</button><button className="danger" onClick={() => { if (window.confirm('Excluir esta nota permanentemente?')) void noteAction(contextMenu.note.id,'permanent') }}>Excluir permanentemente</button></> : <><button onClick={() => { void noteAction(contextMenu.note.id,contextMenu.note.isArchived ? 'unarchive' : 'archive') }}>{contextMenu.note.isArchived ? 'Desarquivar' : 'Arquivar'}</button><button className="danger" onClick={() => { void noteAction(contextMenu.note.id,'delete') }}>Mover para lixeira</button></>}</> : contextMenu.type === 'project' ? <><button onClick={() => { setDialog({type:'folder',projectId:contextMenu.project.id}); setContextMenu(null) }}>Nova pasta</button><button onClick={() => { setDialog({type:'project',project:contextMenu.project}); setContextMenu(null) }}>Editar projeto</button><button onClick={() => { void exportProject(contextMenu.project) }}>Exportar projeto</button>{contextMenu.project.isArchived && !contextMenu.project.isDeleted ? <button onClick={() => { void projectAction(contextMenu.project.id,'unarchive') }}>Desarquivar</button> : !contextMenu.project.isDeleted && <button onClick={() => { void projectAction(contextMenu.project.id,'archive') }}>Arquivar</button>}{contextMenu.project.isDeleted ? <button onClick={() => { void projectAction(contextMenu.project.id,'restore') }}>Restaurar</button> : <button className="danger" onClick={() => { void projectAction(contextMenu.project.id,'delete') }}>Excluir</button>}</> : <><button onClick={() => { setDialog({type:'folder',projectId:contextMenu.folder.projectId,folder:contextMenu.folder}); setContextMenu(null) }}>Renomear pasta</button><button className="danger" onClick={() => { void folderAction(contextMenu.folder.id,true) }}>Excluir pasta</button></>}
    </div></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { void autosave.flush(); setError('') }}>Tentar novamente</button><button aria-label="Fechar erro" onClick={() => setError('')}><X size={16}/></button></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
