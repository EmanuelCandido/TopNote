import { useState, type ReactNode } from 'react'
import { Folder, History, Palette, X } from 'lucide-react'
import type { Folder as FolderType, Project, Version } from '../types'
import { formatDate } from '../services/format'
import { ProjectIcon, projectIconChoices } from './ProjectIcon'

function DialogHeading({icon,title,description,onClose}: {icon:ReactNode;title:string;description:string;onClose:()=>void}) {
  return <header className="form-modal-head">
    <div className="dialog-heading"><div className="modal-icon">{icon}</div><div><h2>{title}</h2><p>{description}</p></div></div>
    <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar janela"><X size={18}/></button>
  </header>
}

export function ProjectDialog({ project, onSave, onClose }: { project?: Project; onSave: (value: { id?: string; name: string; description: string; color: string; icon: string }) => Promise<void>; onClose: () => void }) {
  const [name,setName] = useState(project?.name ?? '')
  const [description,setDescription] = useState(project?.description ?? '')
  const [color,setColor] = useState(project?.color ?? '#12A9F0')
  const [icon,setIcon] = useState(project?.icon ?? 'folder')
  const [saving,setSaving] = useState(false)
  const colors = ['#12A9F0','#5B8DEF','#61B7A7','#CE8FDC','#E6A96D','#E0787B','#8C9AB0']
  return <form className="form-modal" onSubmit={event => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    void onSave({id:project?.id,name,description,color,icon}).finally(() => setSaving(false))
  }}>
    <DialogHeading icon={<ProjectIcon name={icon} color={color} size={23}/>} title={project ? 'Editar projeto' : 'Novo projeto'} description="Reúna notas e pastas em um só lugar." onClose={onClose}/>
    <div className="form-modal-body">
      <label>Nome<input autoFocus maxLength={100} required placeholder="Ex.: CliniCase" value={name} onChange={event => setName(event.target.value)}/></label>
      <label>Descrição <span className="optional">opcional</span><textarea rows={3} maxLength={2000} placeholder="Sobre o que é este projeto?" value={description} onChange={event => setDescription(event.target.value)}/></label>
      <div className="color-label"><Palette size={15}/>Cor</div>
      <div className="color-swatches" role="group" aria-label="Cor do projeto">{colors.map(candidate => <button key={candidate} type="button" className={candidate === color ? 'selected' : ''} style={{background:candidate}} aria-label={candidate} aria-pressed={candidate === color} onClick={() => setColor(candidate)}/>)}</div>
      <div className="color-label"><Folder size={15}/>Ícone</div>
      <div className="project-icon-choices" role="group" aria-label="Ícone do projeto">{projectIconChoices.map(choice => <button key={choice.id} type="button" className={choice.id === icon ? 'selected' : ''} title={choice.label} aria-label={choice.label} aria-pressed={choice.id === icon} onClick={() => setIcon(choice.id)}><ProjectIcon name={choice.id} color={choice.id === icon ? color : undefined} size={22}/></button>)}</div>
    </div>
    <footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || !name.trim()}>{saving ? 'Salvando…' : project ? 'Salvar alterações' : 'Criar projeto'}</button></footer>
  </form>
}

export function FolderDialog({ folder, projectName, onSave, onClose }: { folder?: FolderType; projectName: string; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name,setName] = useState(folder?.name ?? '')
  const [saving,setSaving] = useState(false)
  return <form className="form-modal" onSubmit={event => { event.preventDefault(); if (saving) return; setSaving(true); void onSave(name).finally(() => setSaving(false)) }}>
    <DialogHeading icon={<Folder size={23}/>} title={folder ? 'Renomear pasta' : 'Nova pasta'} description={`Dentro de ${projectName}`} onClose={onClose}/>
    <div className="form-modal-body"><label>Nome<input autoFocus maxLength={100} required placeholder="Ex.: Reuniões" value={name} onChange={event => setName(event.target.value)}/></label></div>
    <footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || !name.trim()}>{saving ? 'Salvando…' : folder ? 'Renomear' : 'Criar pasta'}</button></footer>
  </form>
}

export function VersionsDialog({ versions, onRestore, onClose }: { versions: Version[]; onRestore: (id: string) => Promise<void>; onClose: () => void }) {
  return <section className="form-modal">
    <DialogHeading icon={<History size={23}/>} title="Histórico da nota" description="Volte a uma versão anterior da sua nota." onClose={onClose}/>
    <div className="form-modal-body"><div className="version-list">{versions.length === 0 && <div className="version-empty">Ainda não há versões anteriores desta nota.</div>}{versions.map(version => <div className="version-row" key={version.id}><div><strong>{version.title || 'Sem título'}</strong><span>{formatDate(version.createdAt)} · {version.contentText.slice(0,100) || 'Nota vazia'}</span></div><button className="secondary-button" onClick={() => void onRestore(version.id)}>Restaurar</button></div>)}</div></div>
    <footer className="modal-footer"><button className="secondary-button" onClick={onClose}>Fechar</button></footer>
  </section>
}
