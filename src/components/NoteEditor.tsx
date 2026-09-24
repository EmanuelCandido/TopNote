import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Bold, Code, Heading1, Heading2, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Minus, Paperclip, Quote, Strikethrough, Underline as UnderlineIcon } from 'lucide-react'
import type { Attachment, Note } from '../types'
import { parseContent } from '../services/format'

type Props = {
  note: Note
  compact?: boolean
  onChange: (json: string, text: string) => void
  onFiles: (files: File[]) => Promise<Attachment[]>
  onPick: (images: boolean) => Promise<Attachment[]>
}

type SlashAction = { label: string; icon: typeof Bold; run: (editor: Editor) => void | boolean | Promise<void> }

export function NoteEditor({ note, compact = false, onChange, onFiles, onPick }: Props) {
  const callbacks = useRef({ onChange, onFiles, onPick })
  callbacks.current = { onChange, onFiles, onPick }
  const container = useRef<HTMLDivElement>(null)
  const [slash, setSlash] = useState<{ from: number; text: string; x: number; y: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashRef = useRef(slash)
  slashRef.current = slash

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
    ],
    content: parseContent(note.contentJson),
    editorProps: {
      attributes: { class: 'prose-editor', spellcheck: 'true', 'aria-label': 'Conteúdo da nota' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length) return false
        event.preventDefault()
        void callbacks.current.onFiles(files).then(items => insertImages(editorRef.current, items))
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false
        event.preventDefault()
        void callbacks.current.onFiles(files).then(items => insertImages(editorRef.current, items))
        return true
      },
    },
    onUpdate: ({ editor: current }) => {
      callbacks.current.onChange(JSON.stringify(current.getJSON()), current.getText({ blockSeparator: '\n' }))
      const { $from, from } = current.state.selection
      const before = $from.parent.textBetween(0, $from.parentOffset)
      const match = before.match(/(?:^|\s)(\/[\p{L}\p{N}]*)$/u)
      if (!match) { setSlash(null); return }
      const coords = current.view.coordsAtPos(from)
      const rect = container.current?.getBoundingClientRect()
      setSlash({ from: from - match[1].length, text: match[1].slice(1).toLowerCase(), x: Math.min((coords.left - (rect?.left ?? 0)), (rect?.width ?? 480) - 220), y: Math.min(coords.bottom - (rect?.top ?? 0) + 4, (rect?.height ?? 620) - 310) })
      setSlashIndex(0)
    },
  }, [])
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  useEffect(() => {
    if (!editor || !compact) return
    const handle = (event: Event) => {
      const action = (event as CustomEvent<string>).detail
      if (action === 'image') void callbacks.current.onPick(true).then(items => insertImages(editor, items))
      if (action === 'taskList') editor.chain().focus().toggleTaskList().run()
      if (action === 'codeBlock') editor.chain().focus().toggleCodeBlock().run()
    }
    window.addEventListener('topnote:editor-action', handle)
    return () => window.removeEventListener('topnote:editor-action', handle)
  }, [editor, compact])

  useEffect(() => {
    if (!editor) return
    const content = parseContent(note.contentJson)
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) editor.commands.setContent(content, false)
  }, [editor, note.id, note.contentJson])

  useEffect(() => {
    if (compact && editor) {
      const timeout = setTimeout(() => editor.commands.focus('end'), 80)
      return () => clearTimeout(timeout)
    }
  }, [compact, editor, note.id])

  const actions: SlashAction[] = [
    { label: 'Texto', icon: List, run: e => e.chain().focus().setParagraph().run() },
    { label: 'Título 1', icon: Heading1, run: e => e.chain().focus().setHeading({ level: 1 }).run() },
    { label: 'Título 2', icon: Heading2, run: e => e.chain().focus().setHeading({ level: 2 }).run() },
    { label: 'Checklist', icon: ListChecks, run: e => e.chain().focus().toggleTaskList().run() },
    { label: 'Lista', icon: List, run: e => e.chain().focus().toggleBulletList().run() },
    { label: 'Código', icon: Code, run: e => e.chain().focus().toggleCodeBlock().run() },
    { label: 'Imagem', icon: ImagePlus, run: async e => insertImages(e, await onPick(true)) },
    { label: 'Arquivo', icon: Paperclip, run: async () => { await onPick(false) } },
    { label: 'Divisor', icon: Minus, run: e => e.chain().focus().setHorizontalRule().run() },
    { label: 'Citação', icon: Quote, run: e => e.chain().focus().toggleBlockquote().run() },
  ]
  const matching = slash ? actions.filter(a => a.label.toLocaleLowerCase('pt-BR').includes(slash.text)) : []
  function applySlash(index: number) {
    if (!editor || !slashRef.current) return
    const action = matching[index]
    if (!action) return
    editor.chain().focus().deleteRange({ from: slashRef.current.from, to: editor.state.selection.from }).run()
    setSlash(null)
    void action.run(editor)
  }

  function keyDown(event: React.KeyboardEvent) {
    if (!slash || !matching.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex(i => (i + 1) % matching.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex(i => (i - 1 + matching.length) % matching.length) }
    if (event.key === 'Enter') { event.preventDefault(); applySlash(slashIndex) }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSlash(null) }
  }

  function link() {
    if (!editor) return
    const current = editor.getAttributes('link').href as string | undefined
    const address = window.prompt('Endereço do link (https://…)', current ?? 'https://')
    if (address === null) return
    if (address.trim() === '') { editor.chain().focus().unsetLink().run(); return }
    if (!/^(https?:\/\/|mailto:)/i.test(address)) { window.alert('Use um endereço http, https ou mailto.'); return }
    editor.chain().focus().setLink({ href: address }).run()
  }

  return <div className={`editor-shell ${compact ? 'editor-compact' : ''}`} ref={container} onKeyDownCapture={keyDown}>
    <div className="editor-toolbar" role="toolbar" aria-label="Formatação">
      <Tool label="Negrito" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} icon={Bold} />
      <Tool label="Itálico" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} icon={Italic} />
      <Tool label="Sublinhado" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} icon={UnderlineIcon} />
      <Tool label="Tachado" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} icon={Strikethrough} />
      <span className="toolbar-separator" />
      <Tool label="Título" active={editor?.isActive('heading')} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} icon={Heading2} />
      <Tool label="Lista" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} icon={List} />
      <Tool label="Lista numerada" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} icon={ListOrdered} />
      <Tool label="Checklist" active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} icon={ListChecks} />
      <Tool label="Código" active={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} icon={Code} />
      <Tool label="Link" onClick={link} icon={Link2} />
      <span className="toolbar-separator" />
      <Tool label="Imagem" onClick={() => { void onPick(true).then(items => insertImages(editor, items)) }} icon={ImagePlus} />
      <Tool label="Anexar arquivo" onClick={() => { void onPick(false) }} icon={Paperclip} />
    </div>
    <div className="editor-content" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}>
      <EditorContent editor={editor} />
    </div>
    {slash && matching.length > 0 && <div className="slash-menu" style={{ left: Math.max(10, slash.x), top: Math.max(44, slash.y) }}>
      <div className="slash-title">Inserir bloco</div>
      {matching.map((action, index) => <button key={action.label} className={index === slashIndex ? 'selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => applySlash(index)}><action.icon size={16} />{action.label}</button>)}
    </div>}
  </div>
}

function insertImages(editor: Editor | null, items: Attachment[]) {
  if (!editor) return
  for (const item of items) if (item.mimeType.startsWith('image/')) editor.chain().focus().setImage({ src: convertFileSrc(item.path), alt: item.originalName }).run()
}

function Tool({ label, active, onClick, icon: Icon }: { label: string; active?: boolean; onClick: () => void; icon: typeof Bold }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={!!active} className={`tool ${active ? 'active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={onClick}><Icon size={16} strokeWidth={1.8} /></button>
}
