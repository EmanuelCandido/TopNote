import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import { parseContent } from './format'

const extensions = [StarterKit.configure({ heading: { levels: [1,2,3] } }),Image.configure({inline:false,allowBase64:false}),Link.configure({openOnClick:false}),TaskList,TaskItem.configure({nested:true}),Underline]
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char))

export function toHtml(title: string, contentJson: string): string {
  const body = generateHTML(parseContent(contentJson),extensions)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px/1.65 Segoe UI,system-ui,sans-serif;max-width:760px;margin:50px auto;padding:0 24px;color:#1b2736}img{max-width:100%}pre{background:#f0f3f7;padding:16px;border-radius:8px;overflow:auto}blockquote{border-left:3px solid #4d89e4;padding-left:14px;color:#5c6876}</style></head><body><h1>${escapeHtml(title || 'Sem título')}</h1>${body}</body></html>`
}
