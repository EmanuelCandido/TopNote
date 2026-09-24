import { convertFileSrc } from '@tauri-apps/api/core'
import { ExternalLink, FolderOpen, GripVertical, Paperclip, Trash2, X } from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Attachment } from '../types'
import { formatBytes } from '../services/format'
import { api } from '../services/api'

function fileBadge(item: Attachment): { label: string; kind: string } {
  const extension = item.originalName.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'pdf') return { label: 'PDF', kind: 'pdf' }
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) return { label: 'DOC', kind: 'document' }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension)) return { label: 'XLS', kind: 'spreadsheet' }
  if (['ppt', 'pptx', 'odp'].includes(extension)) return { label: 'PPT', kind: 'presentation' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return { label: 'ZIP', kind: 'archive' }
  if (['txt', 'md', 'log'].includes(extension)) return { label: extension.toUpperCase(), kind: 'text' }
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'rs', 'xml', 'yaml', 'yml'].includes(extension)) return { label: '</>', kind: 'code' }
  if (item.mimeType.startsWith('audio/')) return { label: '♪', kind: 'audio' }
  if (item.mimeType.startsWith('video/')) return { label: '▶', kind: 'video' }
  return { label: extension.slice(0, 3).toUpperCase() || 'FILE', kind: 'other' }
}

type DragPress = { id: string; pointerId: number; x: number; y: number }

export function AttachmentsPanel({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (attachment: Attachment) => void }) {
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [dragError, setDragError] = useState('')
  const [actionError, setActionError] = useState('')
  const press = useRef<DragPress | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, item: Attachment) {
    if (event.button !== 0 || event.pointerType !== 'mouse' ||
        (event.target instanceof Element && event.target.closest('button'))) return
    press.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = press.current
    if (!start || start.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7) return
    press.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragError('')
    void api.startAttachmentDrag(start.id).catch(error => {
      setDragError(`Não foi possível arrastar o anexo: ${String(error)}`)
    })
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (press.current?.pointerId === event.pointerId) press.current = null
  }

  function runAction(action: 'open' | 'reveal', item: Attachment) {
    setActionError('')
    const request = action === 'open' ? api.openAttachment(item.id) : api.revealAttachment(item.id)
    void request.catch(error => {
      setActionError(`Não foi possível ${action === 'open' ? 'abrir' : 'localizar'} “${item.originalName}”: ${String(error)}`)
    })
  }

  return <>
    <div className="property-section"><div className="property-heading"><Paperclip size={15}/>Anexos <span>{attachments.length}</span></div>
      {attachments.length === 0 && <p className="property-empty">Arraste ou cole arquivos no editor.</p>}
      {attachments.map(item => {
        const badge = fileBadge(item)
        return <div className="attachment-row" key={item.id} title="Arraste para copiar este arquivo para outra pasta"
          onPointerDown={event => handlePointerDown(event, item)} onPointerMove={handlePointerMove}
          onPointerUp={endPointer} onPointerCancel={endPointer} onDragStart={event => event.preventDefault()}>
        {item.mimeType.startsWith('image/') ? <button className="attachment-thumb" onClick={() => setPreview(item)} title="Ampliar imagem"><img src={convertFileSrc(item.path)} alt={item.originalName} loading="lazy" draggable={false} /></button> : <div className={`attachment-file-icon attachment-file-${badge.kind}`} aria-hidden="true"><span>{badge.label}</span></div>}
        <div className="attachment-info"><strong title={item.originalName}>{item.originalName}</strong><span>{formatBytes(item.byteSize)}</span></div>
        <GripVertical className="attachment-drag-grip" size={13} aria-hidden="true" />
        <div className="attachment-actions"><button title="Abrir" aria-label={`Abrir ${item.originalName}`} onClick={() => runAction('open', item)}><ExternalLink size={14}/></button><button title="Mostrar no Explorer" aria-label={`Mostrar ${item.originalName} no Explorer`} onClick={() => runAction('reveal', item)}><FolderOpen size={14}/></button><button title="Remover da nota" aria-label="Remover anexo" onClick={() => onRemove(item)}><Trash2 size={14}/></button></div>
      </div>})}
      {attachments.length > 0 && <p className="attachment-drag-hint">Arraste um anexo pelo nome para copiá-lo.</p>}
      {dragError && <p className="attachment-drag-error" role="alert">{dragError}</p>}
      {actionError && <p className="attachment-drag-error" role="alert">{actionError}</p>}
    </div>
    {preview && <div className="image-preview-backdrop" onClick={() => setPreview(null)}><div className="image-preview" onClick={event => event.stopPropagation()}><button className="image-preview-close" onClick={() => setPreview(null)} aria-label="Fechar"><X size={20}/></button><img src={convertFileSrc(preview.path)} alt={preview.originalName}/><div>{preview.originalName}</div></div></div>}
  </>
}
