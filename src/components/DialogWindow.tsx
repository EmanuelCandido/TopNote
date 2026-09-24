import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit, emitTo, listen } from '@tauri-apps/api/event'
import { isWindowHeader, useWindowDrag } from '../hooks/useWindowDrag'
import type { Folder, Project, Version } from '../types'
import { api } from '../services/api'
import { FolderDialog, ProjectDialog, VersionsDialog } from './Dialogs'
import { useAppearance } from '../hooks/useAppearance'
import { ResizeHandles } from './ResizeHandles'

type DialogRequest = { requestId: string; kind: 'project' | 'folder' | 'versions'; id: string | null; projectId: string | null }

export function DialogWindow() {
  useAppearance()
  const drag = useWindowDrag(target => !!target.closest('.form-modal-head') && isWindowHeader(target))
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const [project, setProject] = useState<Project>()
  const [folder, setFolder] = useState<Folder>()
  const [projectName, setProjectName] = useState('projeto')
  const [versions, setVersions] = useState<Version[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const serial = useRef(0)

  useEffect(() => {
    let active = true
    const stops: (() => void)[] = []
    void Promise.all([
      listen<DialogRequest>('topnote:dialog-request', event => { if (active) setRequest(event.payload) }),
      listen('topnote:dialog-closed', () => { if (active) setRequest(null) }),
    ]).then(unlisteners => unlisteners.forEach(unlisten => { if (active) stops.push(unlisten); else unlisten() }))
      .then(() => invoke<DialogRequest | null>('get_dialog_request'))
      .then(current => { if (active && current) setRequest(current) })
      .catch(console.error)
    return () => { active = false; stops.forEach(stop => stop()) }
  }, [])

  useEffect(() => {
    if (!request) return
    let active = true
    const currentSerial = ++serial.current
    setLoading(true)
    setError('')
    setProject(undefined)
    setFolder(undefined)
    setVersions([])
    const load = async () => {
      if (request.kind === 'project' && request.id) {
        const value = (await api.projects()).find(item => item.id === request.id)
        if (!value) throw new Error('Projeto não encontrado.')
        if (active && serial.current === currentSerial) setProject(value)
      }
      if (request.kind === 'folder') {
        const [projects, folders] = await Promise.all([api.projects(),api.folders()])
        const name = projects.find(item => item.id === request.projectId)?.name ?? 'projeto'
        if (active && serial.current === currentSerial) {
          setProjectName(name)
          setFolder(folders.find(item => item.id === request.id))
        }
      }
      if (request.kind === 'versions' && request.id) {
        const entries = await api.versions(request.id)
        if (active && serial.current === currentSerial) setVersions(entries)
      }
    }
    void load().catch(failure => { if (active) setError(String(failure)) }).finally(() => { if (active && serial.current === currentSerial) setLoading(false) })
    return () => { active = false }
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); void close() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function close() {
    try { await api.hideDialog(); setRequest(null) }
    catch (failure) { setError(String(failure)) }
  }

  async function saveProject(value: { id?: string; name: string; description: string; color: string; icon: string }) {
    try {
      const saved = await api.upsertProject(value)
      await emit('topnote:project-saved', { id:saved.id, isNew:!value.id })
      await close()
    } catch (failure) { setError(String(failure)) }
  }

  async function saveFolder(name: string) {
    if (!request?.projectId) return
    try {
      const saved = await api.upsertFolder({ id:request.id ?? undefined, projectId:request.projectId, name })
      await emit('topnote:folder-saved', { id:saved.id, projectId:request.projectId, isNew:!request.id })
      await close()
    } catch (failure) { setError(String(failure)) }
  }

  async function restoreVersion(id: string) {
    try {
      await emitTo('main','topnote:restore-version',id)
    } catch (failure) { setError(String(failure)) }
  }

  return <div className={`dialog-window dialog-${request?.kind ?? 'empty'}`} {...drag.bind}>
    <ResizeHandles/>
    {loading ? <div className="dialog-loading">Carregando…</div> : request?.kind === 'project' ? <ProjectDialog key={request.requestId} project={project} onSave={saveProject} onClose={() => { void close() }}/> : request?.kind === 'folder' ? <FolderDialog key={request.requestId} folder={folder} projectName={projectName} onSave={saveFolder} onClose={() => { void close() }}/> : request?.kind === 'versions' ? <VersionsDialog key={request.requestId} versions={versions} onRestore={restoreVersion} onClose={() => { void close() }}/> : null}
    {error && <div className="dialog-error" role="alert">{error}</div>}
  </div>
}
