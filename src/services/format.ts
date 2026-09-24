import type { JSONContent } from '@tiptap/core'

export function parseContent(source: string): JSONContent {
  try {
    const value = JSON.parse(source) as JSONContent
    if (value.type === 'doc') return value
  } catch { /* Invalid saved content falls back to an empty document. */ }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function inline(node: JSONContent): string {
  if (node.type === 'image') return `![imagem](${node.attrs?.src ?? ''})`
  let text = node.text ?? (node.content ?? []).map(inline).join('')
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') text = `**${text}**`
    if (mark.type === 'italic') text = `*${text}*`
    if (mark.type === 'strike') text = `~~${text}~~`
    if (mark.type === 'code') text = `\`${text}\``
    if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`
  }
  return text
}

function block(node: JSONContent, indent = ''): string {
  const text = (node.content ?? []).map(inline).join('')
  switch (node.type) {
    case 'heading': return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${text}`
    case 'blockquote': return (node.content ?? []).map(n => block(n).split('\n').map(l => `> ${l}`).join('\n')).join('\n')
    case 'codeBlock': return `\`\`\`${node.attrs?.language ?? ''}\n${text}\n\`\`\``
    case 'horizontalRule': return '---'
    case 'bulletList': return (node.content ?? []).map(n => `${indent}- ${block(n, indent + '  ')}`).join('\n')
    case 'orderedList': return (node.content ?? []).map((n, i) => `${indent}${i + 1}. ${block(n, indent + '   ')}`).join('\n')
    case 'taskList': return (node.content ?? []).map(n => `${indent}- [${n.attrs?.checked ? 'x' : ' '}] ${block(n, indent + '  ')}`).join('\n')
    case 'listItem': case 'taskItem': return (node.content ?? []).map(n => block(n, indent)).join('\n')
    default: return text
  }
}

export function toMarkdown(contentJson: string): string {
  return (parseContent(contentJson).content ?? []).map(n => block(n)).join('\n\n').trim() + '\n'
}

export function removeImage(contentJson: string, source: string): string {
  const prune = (node: JSONContent): JSONContent => ({
    ...node,
    content: node.content?.filter(child => !(child.type === 'image' && child.attrs?.src === source)).map(prune),
  })
  return JSON.stringify(prune(parseContent(contentJson)))
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(timestamp * 1000)
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
}
