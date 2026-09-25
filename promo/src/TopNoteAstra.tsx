import { useEffect, useState, type CSSProperties } from 'react'
import {
  AbsoluteFill, Easing, Html5Audio, Img, Sequence, cancelRender, continueRender,
  delayRender, interpolate, spring, staticFile, useCurrentFrame,
} from 'remotion'
import {
  Archive, ArrowDownLeft, ArrowRight, ArrowUpRight, Bold, Check, CheckCheck,
  ChevronDown, ChevronRight, ChevronsDown, Clock3, Code2, FileText, Folder,
  FolderOpen, GripVertical, HardDrive, Image as ImageIcon, Inbox, Italic,
  Layers3, List, LockKeyhole, Maximize2, MoreHorizontal, Paperclip, Plus,
  Search, ShieldCheck, Star, Underline, UserRoundX, X,
} from 'lucide-react'
import { DURATION, FPS, SCENES } from './storyboard'
import './astra.css'

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const curve = Easing.bezier(0.22, 1, 0.36, 1)
const soft = Easing.bezier(0.65, 0, 0.35, 1)
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const progress = (f: number, from: number, to: number) => clamp((f - from) / (to - from))
const move = (f: number, from: number, to: number, a: number, b: number) => lerp(a, b, curve(progress(f, from, to)))
const fade = (f: number, from = 0, length = 24) => progress(f, from, from + length)
const enter = (f: number, from = 0, distance = 40): CSSProperties => ({
  opacity: fade(f, from), transform: `translateY(${move(f, from, from + 48, distance, 0)}px)`,
})
const typed = (text: string, f: number, start: number, end: number) => text.slice(0, Math.floor(progress(f, start, end) * text.length))

function Logo({ size = 40, style }: { size?: number; style?: CSSProperties }) {
  return <Img src={staticFile('topnote-icon-hd.png')} style={{ width: size, height: size, objectFit: 'contain', ...style }}/>
}

function Mark({ light = false }: { light?: boolean }) {
  return <div className={`a-mark ${light ? 'a-light' : ''}`}><Logo size={42}/><b>TopNote</b><span>NOTAS PARA WINDOWS</span></div>
}

function Chapter({ index, label, dark = false }: { index: string; label: string; dark?: boolean }) {
  return <><Mark light={dark}/><div className={`a-chapter ${dark ? 'a-light' : ''}`}><span>{index}</span>{label}</div></>
}

function Lines({ lines, f, start = 0, className = '', style }: { lines: string[]; f: number; start?: number; className?: string; style?: CSSProperties }) {
  return <div className={`a-lines ${className}`} style={style}>{lines.map((line, i) => <div className="a-line-clip" key={line}>
    <div style={{ transform: `translateY(${move(f, start + i * 12, start + i * 12 + 62, 115, 0)}%) rotate(${move(f, start + i * 12, start + i * 12 + 62, 3, 0)}deg)` }}>{line}</div>
  </div>)}</div>
}

function Trail({ f, start = 0, duration = 120, d, color = '#0866ff', width = 5, style }: { f: number; start?: number; duration?: number; d: string; color?: string; width?: number; style?: CSSProperties }) {
  return <svg className="a-trail" viewBox="0 0 1920 1080" style={style}><path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - curve(progress(f, start, start + duration))}/></svg>
}

type Point = { f: number; x: number; y: number }
function position(f: number, points: Point[]) {
  if (f <= points[0].f) return points[0]
  for (let i = 1; i < points.length; i++) {
    if (f <= points[i].f) {
      const a = points[i - 1], b = points[i], p = soft(progress(f, a.f, b.f))
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }
    }
  }
  return points[points.length - 1]
}

function Cursor({ f, points, clicks = [], copy = false, opacity = 1, offsetY = 0 }: { f: number; points: Point[]; clicks?: number[]; copy?: boolean; opacity?: number; offsetY?: number }) {
  const p = position(f, points)
  const click = clicks.find((c) => f >= c && f < c + 30)
  const pulse = click === undefined ? 1 : progress(f, click, click + 30)
  return <div className="a-cursor" style={{ left: p.x, top: p.y + offsetY, opacity, transform: `scale(${click !== undefined && f < click + 8 ? 0.85 : 1})` }}>
    {click !== undefined && <i style={{ transform: `translate(-50%,-50%) scale(${lerp(0.2, 1.7, pulse)})`, opacity: 1 - pulse }}/>}<svg width="34" height="42" viewBox="0 0 34 42"><path d="M3 2L29 23L17 25L12 38Z" fill="#fff" stroke="#132a40" strokeWidth="2" strokeLinejoin="round"/></svg>
    {copy && <span><Plus size={17}/> Copiar</span>}
  </div>
}

function Keycaps({ f, labels = ['Ctrl', 'Shift', 'Space'], press = 55 }: { f: number; labels?: string[]; press?: number }) {
  return <div className="a-keycaps">{labels.map((label, i) => {
    const down = progress(f, press + i * 5, press + i * 5 + 5) * (1 - progress(f, press + 26, press + 36))
    return <div key={label} className={`a-key ${label === 'Space' ? 'a-space' : ''}`} style={{ transform: `translateY(${down * 8 + move(f, i * 10, i * 10 + 48, 35, 0)}px)`, boxShadow: `0 ${lerp(9, 2, down)}px 0 #1b303b, 0 18px 35px #0003`, borderColor: down > 0.3 ? '#77d7ff' : '#5b7180', color: down > 0.3 ? '#81ddff' : '#e9f2f6', opacity: fade(f, i * 10) }}>{label === 'Space' ? <><span>Space</span><i/></> : label}</div>
  })}</div>
}

function Footer({ saved = true, attachment = false }: { saved?: boolean; attachment?: boolean }) {
  return <div className="a-note-footer"><div><Paperclip size={23}/>{attachment && <small>1</small>}<ImageIcon size={23}/><List size={23}/><Code2 size={23}/></div><span className={saved ? 'a-saved' : ''}>{saved ? <><Check size={23}/> Salvo</> : 'Salvando…'}</span><MoreHorizontal size={24}/></div>
}

function NoteHeader({ project = 'Inbox' }: { project?: string }) {
  return <div className="a-note-header"><span><span className="a-project-dot"/>{project}<ChevronDown size={18}/><Plus size={21}/></span><div><Search size={22}/><Maximize2 size={20}/><MoreHorizontal size={23}/></div></div>
}

function NoteBody({ f = 999, typeStart = 0, title = 'Uma ideia para sexta', alternate = false, compact = false }: { f?: number; typeStart?: number; title?: string; alternate?: boolean; compact?: boolean }) {
  const actualTitle = alternate ? 'Roteiro do vídeo' : title
  const actualBody = alternate ? 'Uma história simples. Uma ideia de cada vez.' : 'Gravar a primeira versão.\nMostrar o essencial.'
  const titleEnd = typeStart + 46
  const bodyEnd = typeStart + 126
  return <div className={`a-note-body ${compact ? 'a-note-compact' : ''}`}>
    <div className="a-note-eyebrow">{alternate ? 'AURORA / ROTEIRO' : 'UMA PEQUENA IDEIA, UM PRÓXIMO PASSO'}</div>
    <h3>{typed(actualTitle, f, typeStart, titleEnd)}{f >= typeStart && f < titleEnd && <span className="a-caret"/>}</h3>
    <div className="a-note-date">Sexta-feira, 09:41</div>
    <div className="a-toolbar"><Bold/><Italic/><Underline/><i/><List/><CheckCheck/><Code2/><Paperclip/></div>
    <p>{typed(actualBody, f, titleEnd + 6, bodyEnd).split('\n').map((line, i) => <span key={i}>{line}<br/></span>)}{f >= titleEnd && f < bodyEnd && <span className="a-caret"/>}</p>
    {alternate && <div className="a-checklist"><span><i><Check size={14}/></i> Apresentar a ideia</span><span><i/> Mostrar o produto em ação</span><span><i/> Convidar para experimentar</span></div>}
  </div>
}

function Idea() {
  const f = useCurrentFrame()
  const float = Math.sin(f / 65) * 9
  const entry = spring({ frame: f - 18, fps: FPS, config: { damping: 19, stiffness: 62, mass: 1.2 } })
  return <AbsoluteFill className="a-paper a-intro">
    <Mark/>
    <div className="a-edition">UM LUGAR PARA O PRÓXIMO PENSAMENTO <span>01—07</span></div>
    <Lines f={f} start={8} lines={['Boas ideias', 'não esperam.']} className="a-intro-title"/>
    <div className="a-intro-description" style={enter(f, 56)}>Capture o momento.<br/>Continue de onde a ideia começou.</div>
    <Trail f={f} start={48} duration={135} d="M 137 664 C 351 641 703 643 929 663 C 1113 680 1033 898 1203 908 C 1417 918 1637 746 1587 595 C 1549 492 1460 470 1400 500" width={5}/>
    <div className="a-thought a-thought-one" style={{ opacity: fade(f, 20), transform: `translateY(${move(f, 20, 90, -140, float)}px) rotate(-8deg)` }}><span>09:41 / UMA IDEIA</span><strong>E se a gente<br/>começasse hoje?</strong><ArrowUpRight size={24}/></div>
    <div className="a-thought a-thought-two" style={{ opacity: fade(f, 38), transform: `translateX(${move(f, 38, 110, 180, 0)}px) rotate(8deg)` }}><span>SEXTA-FEIRA</span><div><i/> Gravar o primeiro vídeo</div><div><i/> Tirar a ideia do papel</div></div>
    <div className="a-hero-icon" style={{ transform: `translateY(${(1 - entry) * 170 + float}px) rotate(${lerp(18, -8, entry)}deg) scale(${lerp(0.65, 1, entry)})`, opacity: fade(f, 18) }}><Logo size={428}/></div>
    <div className="a-side-type">PENSOU. GUARDOU.</div>
    <div className="a-bottom-caption" style={enter(f, 90, 15)}><span className="a-blue-dot"/> TOPNOTE <span>Pequeno na tela. Grande nas possibilidades.</span></div>
  </AbsoluteFill>
}

function Capture() {
  const f = useCurrentFrame()
  const expand = curve(progress(f, 75, 135))
  const x = lerp(1120, 837, expand), y = lerp(425, 245, expand)
  const width = lerp(365, 950, expand), height = lerp(82, 660, expand)
  const content = fade(f, 119, 20)
  return <AbsoluteFill className="a-dark a-capture">
    <Chapter index="01" label="CAPTURE" dark/>
    <div className="a-dark-orbit"/>
    <Lines f={f} start={7} lines={['Pensou.', 'Anotou.']} className="a-capture-title"/>
    <p className="a-capture-description" style={enter(f, 40)}>Um atalho entre você<br/>e sua próxima ideia.</p>
    <div className="a-capture-keys"><Keycaps f={f} press={55}/></div>
    <div className="a-capture-autosave" style={enter(f, 282, 14)}><CheckCheck size={25}/> Salvo enquanto você pensa.</div>
    <div className="a-quick-shell" style={{ left: x, top: y, width, height, borderRadius: lerp(42, 24, expand), transform: `perspective(1800px) rotateY(${lerp(-10, 0, expand)}deg)` }}>
      <div className="a-capsule-brand" style={{ opacity: 1 - fade(f, 86, 20) }}><Logo size={41}/><b>TopNote</b><ChevronDown size={24}/></div>
      <div className="a-quick-content" style={{ opacity: content, width: 950, height: 660 }}><NoteHeader/><NoteBody f={f} typeStart={143}/><Footer saved={f >= 280}/></div>
    </div>
    <div className="a-window-footnote" style={{ opacity: fade(f, 150) }}><span/> Seu fluxo continua aqui.</div>
  </AbsoluteFill>
}

const menus = [
  { icon: Inbox, text: 'Inbox' }, { icon: Star, text: 'Favoritos' }, { icon: Clock3, text: 'Recentes' },
  { icon: Layers3, text: 'Todas as notas' }, { icon: Archive, text: 'Arquivo' },
]

function WorkWindow({ f }: { f: number }) {
  const assigned = f >= 126
  const expanded = f >= 228
  const alternate = f >= 332
  return <div className="a-work-window">
    <div className="a-work-titlebar"><span><Logo size={23}/> TopNote · Workspace</span><span><ChevronsDown size={17}/> Recolher</span></div>
    <div className="a-work-body">
      <div className="a-work-sidebar">
        <div className="a-work-brand"><Logo size={35}/><b>TopNote</b></div><div className="a-work-eyebrow">BIBLIOTECA</div>
        <div className="a-work-menus">{menus.map(({ icon: Icon, text }, i) => <div className={i === 0 && !assigned ? 'a-selected' : ''} key={text}><Icon size={20}/>{text}</div>)}</div>
        <div className="a-work-project-heading">PROJETOS <Plus size={19}/></div>
        <div className={`a-work-project ${assigned ? 'a-selected' : ''}`}><ChevronRight size={17} style={{ transform: `rotate(${move(f, 228, 248, 0, 90)}deg)` }}/><Folder size={21}/><span>Aurora</span><Plus size={18}/></div>
        <div className="a-work-tree" style={{ height: move(f, 228, 268, 0, 112), opacity: expanded ? 1 : 0 }}>
          {['Uma ideia para sexta', 'Roteiro do vídeo', 'Referências'].map((s, i) => <div key={s} className={(alternate ? i === 1 : i === 0) ? 'a-tree-selected' : ''}><FileText size={15}/>{s}</div>)}
        </div>
        <div className="a-work-local"><span/> Seus dados ficam neste computador</div>
      </div>
      <div className="a-work-list"><div className="a-work-list-top"><div><small>TOPNOTE / BIBLIOTECA</small><h3>{assigned ? 'Aurora' : 'Inbox'}</h3></div><Search size={22}/><span><Plus size={23}/></span></div><p>{assigned ? '3 notas' : '1 nota'}</p>
        {[{ title: 'Uma ideia para sexta', preview: 'Gravar a primeira versão.' }, ...(assigned ? [{ title: 'Roteiro do vídeo', preview: 'Uma história simples.' }, { title: 'Referências', preview: 'Direção, ritmo e inspiração.' }] : [])].map((note, i) => <div className={`a-list-note ${(alternate ? i === 1 : i === 0) ? 'a-list-note-active' : ''}`} key={note.title}><b>{note.title}</b><span>{note.preview}</span><small>{assigned ? 'Aurora' : 'Inbox'} <em>· agora</em></small></div>)}
      </div>
      <div className="a-work-editor">
        <div className="a-work-editor-top"><span><span className="a-project-dot"/>{assigned ? 'Aurora' : 'Inbox'}<ChevronDown size={15}/></span><i>/</i><span>Sem pasta <ChevronDown size={15}/></span><div><Search size={21}/><Star size={21}/><MoreHorizontal size={22}/></div></div>
        <div className="a-work-editor-content"><NoteBody alternate={alternate} compact/><div className="a-properties"><b>Propriedades</b><span>Tags</span><div className="a-tag">{alternate ? 'roteiro' : 'ideia'}</div><span>Anexos <Paperclip size={15}/></span><small>Arraste arquivos<br/>para esta nota.</small></div></div>
        <Footer/>
        {f >= 75 && f < 126 && <div className="a-project-popover" style={enter(f, 75, 8)}><small>MOVER PARA PROJETO</small><div><Inbox size={19}/> Inbox <Check size={18}/></div><div className={f > 108 ? 'a-pop-hover' : ''}><Folder size={19}/> Aurora</div></div>}
      </div>
    </div>
  </div>
}

function Organize() {
  const f = useCurrentFrame()
  return <AbsoluteFill className="a-paper a-organize"><Chapter index="02" label="ORGANIZE"/>
    <Lines f={f} start={8} lines={['Uma ideia. Muitas possibilidades.']} className="a-organize-title"/>
    <div className="a-organize-window" style={{ opacity: fade(f, 10), transform: `translateY(${move(f, 8, 70, 100, 0)}px) scale(${move(f, 8, 70, 0.94, 1)})` }}><WorkWindow f={f}/></div>
    <Cursor f={f} opacity={fade(f, 44)} points={[{ f: 40, x: 1670, y: 963 }, { f: 73, x: 818, y: 382 }, { f: 93, x: 818, y: 382 }, { f: 120, x: 809, y: 505 }, { f: 155, x: 809, y: 505 }, { f: 224, x: 189, y: 787 }, { f: 258, x: 189, y: 787 }, { f: 328, x: 293, y: 862 }, { f: 366, x: 293, y: 862 }]} clicks={[75, 126, 228, 332]}/>
    <div className="a-organize-caption" style={enter(f, 166, 12)}><FolderOpen size={22}/> Um projeto. Quantas notas você precisar.</div>
  </AbsoluteFill>
}

function Find() {
  const f = useCurrentFrame()
  const opened = f >= 45 && f < 213
  const found = f >= 93
  return <AbsoluteFill className="a-dark a-find"><Chapter index="03" label="ENCONTRE" dark/>
    <Lines f={f} start={8} lines={['A ideia certa.', 'Na hora certa.']} className="a-find-title"/>
    <div className="a-find-description" style={enter(f, 37)}>Encontre. Abra. Continue.</div>
    <div className="a-find-keys"><Keycaps f={f} labels={['Ctrl', 'K']} press={24}/></div>
    <div className="a-search-orbit"/>
    <div className="a-find-window a-quick-shell" style={{ opacity: fade(f, 8), transform: `translateY(${move(f, 8, 66, 55, 0)}px)` }}>
      <NoteHeader project="Aurora"/><NoteBody alternate={f < 213} compact/><Footer/>
      {opened && <><div className="a-search-veil" style={{ opacity: fade(f, 45, 14) }}/><div className="a-search-panel" style={enter(f, 45, -12)}><div className="a-search-input"><Search size={27}/><span>{typed('sexta', f, 64, 105)}<i className="a-caret"/></span><kbd>Esc</kbd></div><small>NOTAS {found && '· 1 RESULTADO'}</small>
        {found ? <div className={`a-search-result ${f > 180 ? 'a-search-result-active' : ''}`} style={enter(f, 93, 8)}><FileText size={26}/><div><b>Uma ideia para <mark>sexta</mark></b><p>Gravar a primeira versão. Mostrar o essencial.</p><span>Aurora <ChevronRight size={12}/> Sem pasta</span></div><ArrowRight size={20}/></div> : <div className="a-search-placeholder">Digite para encontrar uma ideia.</div>}
        <div className="a-search-bottom"><span>↑ ↓ navegar</span><span>↵ abrir nota</span></div></div></>}
    </div>
    <Cursor f={f} opacity={fade(f, 123) * (1 - fade(f, 252))} points={[{ f: 120, x: 1840, y: 965 }, { f: 188, x: 1402, y: 553 }, { f: 224, x: 1402, y: 553 }, { f: 260, x: 1700, y: 790 }]} clicks={[206]}/>
    <div className="a-find-bottom" style={enter(f, 222, 12)}><Maximize2 size={21}/> A nota abre na mesma janela compacta.</div>
  </AbsoluteFill>
}

function FileBadge({ small = false }: { small?: boolean }) {
  return <div className={`a-file-badge ${small ? 'a-file-badge-small' : ''}`}><FileText size={small ? 24 : 29}/><b>PDF</b></div>
}

const fileRoute: Point[] = [
  { f: 0, x: 1840, y: 928 }, { f: 60, x: 1350, y: 716 }, { f: 72, x: 1350, y: 716 },
  { f: 132, x: 502, y: 710 }, { f: 180, x: 502, y: 710 }, { f: 222, x: 284, y: 716 },
  { f: 242, x: 284, y: 716 }, { f: 323, x: 1410, y: 713 }, { f: 353, x: 1410, y: 713 },
  { f: 410, x: 1779, y: 942 },
]

function Files() {
  const f = useCurrentFrame()
  const attached = f >= 141
  const copied = f >= 330
  const exporting = f >= 230 && f < 330
  const importing = f >= 67 && f < 141
  const dragged = position(f, fileRoute)
  const dragArc = importing ? Math.sin(progress(f, 72, 132) * Math.PI) * -74 : exporting ? Math.sin(progress(f, 242, 323) * Math.PI) * -74 : 0
  return <AbsoluteFill className="a-paper a-files"><Chapter index="04" label="LEVE COM VOCÊ"/>
    <Lines f={f} start={7} lines={['As ideias ficam.', 'Os arquivos vão com você.']} className="a-files-title"/>
    <div className="a-files-step" style={enter(f, 40, 18)}><span>{f < 205 ? '01' : '02'}</span>{f < 205 ? <>Solte o arquivo.<br/>Ele aparece na nota.</> : <>Pegue o anexo.<br/>Arraste para outra pasta.</>}</div>
    <Trail f={f} start={220} duration={110} d="M 706 749 C 902 972 1214 975 1432 727" color="#86afe6" width={3}/>
    <div className="a-files-note a-quick-shell" style={{ opacity: fade(f, 5), transform: `translateY(${move(f, 5, 65, 75, 0)}px)` }}><NoteHeader project="Aurora"/><div className="a-file-note-copy"><h3>Uma ideia para sexta</h3><p>Gravar a primeira versão.</p></div>
      {attached && <div className="a-attachment-panel" style={{ opacity: fade(f, 141, 10), transform: `translateY(${move(f, 141, 168, 15, 0)}px)` }}><div className="a-attachment-heading"><Paperclip size={18}/> Anexos <span>1</span></div><div className="a-attachment-file"><FileBadge small/><div><b>Briefing.pdf</b><span>248 KB</span></div><GripVertical size={19}/><ArrowUpRight size={18}/><FolderOpen size={18}/></div></div>}
      {importing && <div className="a-drop-zone" style={{ opacity: fade(f, 94, 12) }}><ArrowDownLeft size={36}/> Solte para anexar</div>}<Footer saved={f < 141 || f > 160} attachment={attached}/>
    </div>
    <div className="a-explorer" style={{ opacity: fade(f, 20), transform: `translateY(${move(f, 20, 75, 65, 0)}px)` }}><div className="a-explorer-title"><span><FolderOpen size={24}/> Explorador de Arquivos</span><div>— <X size={17}/></div></div><div className="a-explorer-path"><HardDrive size={18}/> Este computador <ChevronRight size={16}/> {f < 205 ? 'Downloads' : 'Compartilhar'}</div><small>NOME <span>TIPO</span></small>
      {(f < 205 || copied) && <div className={`a-explorer-file ${copied ? 'a-explorer-file-copied' : ''}`} style={copied ? enter(f, 330, 8) : {}}><FileBadge small/><div><b>Briefing.pdf</b><span>Documento PDF</span></div>{copied && <Check size={23}/>}</div>}
      {f >= 205 && !copied && <div className="a-explorer-empty"><FolderOpen size={39}/><span>{exporting ? 'Copiar para Compartilhar' : 'Esta pasta está vazia'}</span></div>}
      <div className="a-explorer-status">{f < 205 || copied ? '1 item' : '0 itens'}<span>{copied ? 'Arquivo copiado' : 'Destino dos arquivos'}</span></div>
    </div>
    {(importing || exporting) && <div className="a-drag-ghost" style={{ left: dragged.x + 15, top: dragged.y - 30 + dragArc, transform: `rotate(${Math.sin(progress(f, importing ? 72 : 242, importing ? 132 : 323) * Math.PI) * (importing ? -7 : 7)}deg)` }}><FileBadge small/><div><b>Briefing.pdf</b><span>248 KB · PDF</span></div></div>}
    <Cursor f={f} opacity={fade(f, 36)} points={fileRoute} offsetY={dragArc} clicks={[65, 141, 228, 330]} copy={importing || exporting}/>
    <div className="a-files-caption" style={enter(f, 342, 14)}><CheckCheck size={23}/> Copiado para a pasta. Preservado na nota.</div>
  </AbsoluteFill>
}

function Local() {
  const f = useCurrentFrame()
  return <AbsoluteFill className="a-local"><Chapter index="05" label="É SEU" dark/>
    <Lines f={f} start={4} lines={['O seu espaço.', 'De verdade.']} className="a-local-title"/>
    <div className="a-local-art">
      {[0, 1, 2].map((i) => <div className="a-local-layer" key={i} style={{ transform: `perspective(1400px) rotateX(48deg) rotateZ(-28deg) translateZ(${move(f, i * 10, 105, -180, (2 - i) * 75)}px) translateY(${i * 60}px)`, opacity: fade(f, i * 10) }}/>) }
      <div className="a-local-logo" style={{ transform: `translateY(${move(f, 10, 90, 80, 0) + Math.sin(f / 50) * 5}px) rotate(-8deg)`, opacity: fade(f, 10) }}><Logo size={295}/></div><div className="a-local-lock" style={enter(f, 65, 20)}><LockKeyhole size={29}/></div>
    </div>
    <div className="a-local-features"><span style={enter(f, 42)}><HardDrive/> Dados locais</span><span style={enter(f, 60)}><UserRoundX/> Sem conta</span><span style={enter(f, 78)}><ShieldCheck/> Você no controle</span></div>
    <div className="a-local-caption" style={enter(f, 96, 14)}>Suas notas e seus anexos ficam no seu computador.</div>
  </AbsoluteFill>
}

function WindowsLogo() {
  return <svg width="25" height="25" viewBox="0 0 25 25" fill="currentColor"><path d="M1 2.8L11 1.4V11.7H1ZM12.5 1.2L24 0V11.7H12.5ZM1 13.2H11V23.5L1 22.1ZM12.5 13.2H24V25L12.5 23.7Z"/></svg>
}

function Brand() {
  const f = useCurrentFrame()
  const springIn = spring({ frame: f - 6, fps: FPS, config: { damping: 18, stiffness: 75 } })
  return <AbsoluteFill className="a-paper a-brand">
    <div className="a-brand-kicker" style={enter(f, 7, 20)}>UM LUGAR PARA O SEU PRÓXIMO PENSAMENTO</div>
    <Trail f={f} start={20} duration={130} d="M -55 534 C 221 289 476 511 461 257 C 450 84 879 68 1052 193 C 1218 313 1349 439 1571 258 C 1728 131 1988 147 1961 439" width={3} color="#adcaeb"/>
    <div className="a-brand-logo" style={{ transform: `translateY(${lerp(-90, 0, springIn)}px) scale(${lerp(0.72, 1, springIn)}) rotate(${lerp(-18, 0, springIn)}deg)`, opacity: fade(f, 6) }}><Logo size={220}/></div>
    <Lines f={f} start={24} lines={['TopNote']} className="a-brand-title"/>
    <div className="a-brand-tagline" style={enter(f, 70, 32)}>Menos atrito. <span>Mais ideias.</span></div>
    <div className="a-brand-cta" style={enter(f, 104, 26)}><WindowsLogo/> Experimente no Windows <ArrowUpRight size={27}/></div>
    <div className="a-brand-url" style={enter(f, 126, 15)}>github.com/EmanuelCandido/TopNote</div>
    <div className="a-brand-bottom"><span>CAPTURE · ORGANIZE · CONTINUE</span><span>TOPNOTE / WINDOWS</span></div>
  </AbsoluteFill>
}

const components = [Idea, Capture, Organize, Find, Files, Local, Brand]

export function TopNoteAstra() {
  const f = useCurrentFrame()
  const [fontHandle] = useState(() => delayRender('Loading bundled TopNote film typography'))
  useEffect(() => {
    Promise.all([
      new FontFace('TnDisplay', `url(${staticFile('fonts/Manrope.ttf')})`, { weight: '200 800' }).load(),
      new FontFace('TnText', `url(${staticFile('fonts/DMSans.ttf')})`, { weight: '100 1000' }).load(),
    ]).then((fonts) => { fonts.forEach((font) => document.fonts.add(font)); continueRender(fontHandle) }).catch(cancelRender)
  }, [fontHandle])
  return <AbsoluteFill className="astra">
    <Html5Audio src={staticFile('topnote-astra-score.wav')}/>
    {SCENES.map((scene, i) => { const Component = components[i]; return <Sequence key={scene.id} from={scene.from} durationInFrames={scene.duration}><Component/></Sequence> })}
    {SCENES.slice(1).map((scene, i) => {
      const p = progress(f, scene.from - 15, scene.from + 15)
      if (p <= 0 || p >= 1) return null
      return <div key={scene.id} className="a-wipe" style={{ background: i === 4 ? '#ebf1ec' : '#0866ff', transform: `translateX(${interpolate(soft(p), [0, 0.5, 1], [-2700, -240, 2300])}px) skewX(-11deg)` }}><span style={{ opacity: i === 4 ? 0.06 : 0.17 }}>TopNote</span></div>
    })}
    <div className="a-film-progress"><i style={{ width: `${(f / (DURATION - 1)) * 100}%` }}/></div>
  </AbsoluteFill>
}
