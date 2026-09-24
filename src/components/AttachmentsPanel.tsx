import { convertFileSrc } from '@tauri-apps/api/core'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { ExternalLink, File, FileText, FolderOpen, Paperclip, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Attachment } from '../types'
import { formatBytes } from '../services/format'

export function AttachmentsPanel({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (attachment: Attachment) => void }) {
  const [preview, setPreview] = useState<Attachment | null>(null)
  return <>
    <div className="property-section"><div className="property-heading"><Paperclip size={15}/>Anexos <span>{attachments.length}</span></div>
      {attachments.length === 0 && <p className="property-empty">Arraste ou cole arquivos no editor.</p>}
      {attachments.map(item => <div className="attachment-row" key={item.id}>
        {item.mimeType.startsWith('image/') ? <button className="attachment-thumb" onClick={() => setPreview(item)} title="Ampliar imagem"><img src={convertFileSrc(item.path)} alt={item.originalName} loading="lazy" /></button> : <div className="attachment-file-icon">{item.mimeType === 'application/pdf' ? <FileText size={18}/> : <File size={18}/>}</div>}
        <div className="attachment-info"><strong title={item.originalName}>{item.originalName}</strong><span>{formatBytes(item.byteSize)}</span></div>
        <div className="attachment-actions"><button title="Abrir" aria-label="Abrir arquivo" onClick={() => void openPath(item.path)}><ExternalLink size={14}/></button><button title="Mostrar no Explorer" aria-label="Mostrar no Explorer" onClick={() => void revealItemInDir(item.path)}><FolderOpen size={14}/></button><button title="Remover da nota" aria-label="Remover anexo" onClick={() => onRemove(item)}><Trash2 size={14}/></button></div>
      </div>)}
    </div>
    {preview && <div className="image-preview-backdrop" onClick={() => setPreview(null)}><div className="image-preview" onClick={event => event.stopPropagation()}><button className="image-preview-close" onClick={() => setPreview(null)} aria-label="Fechar"><X size={20}/></button><img src={convertFileSrc(preview.path)} alt={preview.originalName}/><div>{preview.originalName}</div></div></div>}
  </>
}
