import { useEffect, useState } from 'react'
import type { Folder, Project, Version } from '../types'
import { api } from '../services/api'
import { FolderDialog, ProjectDialog, VersionsDialog } from './Dialogs'

export type DialogRequest = { key: number; kind: 'project' | 'folder' | 'versions'; id: string | null; projectId: string | null }

type Props = {
  request: DialogRequest
  onClose: () => void
  onProjectSaved: (value: { id: string; isNew: boolean }) => void
  onFolderSaved: (value: { id: string; projectId: string; isNew: boolean }) => void
  onRestoreVersion: (id: string) => void
}

/** Project, folder and history dialogs as a sheet inside the editor window. */
export function DialogHost({ request, onClose, onProjectSaved, onFolderSaved, onRestoreVersion }: Props) {
  const [project, setProject] = useState<Project>()
  const [folder, setFolder] = useState<Folder>()
  const [projectName, setProjectName] = useState('projeto')
  const [versions, setVersions] = useState<Version[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      if (request.kind === 'project' && request.id) {
        const value = (await api.projects()).find(item => item.id === request.id)
        if (!value) throw new Error('Projeto não encontrado.')
        if (active) setProject(value)
      }
      if (request.kind === 'folder') {
        const [projects, folders] = await Promise.all([api.projects(),api.folders()])
        if (active) {
          setProjectName(projects.find(item => item.id === request.projectId)?.name ?? 'projeto')
          setFolder(folders.find(item => item.id === request.id))
        }
      }
      if (request.kind === 'versions' && request.id) {
        const entries = await api.versions(request.id)
        if (active) setVersions(entries)
      }
    }
    void load().catch(failure => { if (active) setError(String(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [request])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  async function saveProject(value: { id?: string; name: string; description: string; color: string; icon: string }) {
    try {
      const saved = await api.upsertProject(value)
      onClose()
      onProjectSaved({ id:saved.id, isNew:!value.id })
    } catch (failure) { setError(String(failure)) }
  }

  async function saveFolder(name: string) {
    if (!request.projectId) return
    try {
      const saved = await api.upsertFolder({ id:request.id ?? undefined, projectId:request.projectId, name })
      onClose()
      onFolderSaved({ id:saved.id, projectId:request.projectId, isNew:!request.id })
    } catch (failure) { setError(String(failure)) }
  }

  return <div className="dialog-cover" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`dialog-window dialog-${request.kind}`} role="dialog" aria-modal="true">
      {loading ? <div className="dialog-loading">Carregando…</div> : request.kind === 'project' ? <ProjectDialog key={request.key} project={project} onSave={saveProject} onClose={onClose}/> : request.kind === 'folder' ? <FolderDialog key={request.key} folder={folder} projectName={projectName} onSave={saveFolder} onClose={onClose}/> : <VersionsDialog key={request.key} versions={versions} onRestore={async id => { onRestoreVersion(id) }} onClose={onClose}/>}
      {error && <div className="dialog-error" role="alert">{error}</div>}
    </div>
  </div>
}
