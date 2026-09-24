import {
  AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion'
import {
  Archive, ArrowDownRight, ArrowRight, Check, CheckCheck, ChevronDown, Clock3,
  Folder, FolderOpen, Inbox, Layers3, MoreHorizontal, Paperclip, Plus, Search, Settings,
  ShieldCheck, Star,
} from 'lucide-react'
import type { ReactNode } from 'react'
import './styles.css'

function appear(frame: number, start = 0, distance = 28) {
  const opacity = interpolate(frame, [start, start + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const translateY = interpolate(frame, [start, start + 22], [distance, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return { opacity, transform: `translateY(${translateY}px)` }
}

function Scene({ duration, children }: { duration: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const fadeIn = interpolate(frame, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <AbsoluteFill className="scene" style={{ opacity: fadeIn * fadeOut }}>{children}</AbsoluteFill>
}

function Logo({ size = 38 }: { size?: number }) {
  return <Img src={staticFile('topnote-icon.png')} style={{ width: size, height: size, objectFit: 'contain' }} />
}

function BrandHeader({ number, label }: { number: string; label: string }) {
  return <div className="brand-header"><div className="brand-header-left"><Logo size={42}/><strong>TopNote</strong></div><span>{number} / {label}</span></div>
}

function SceneCopy({ eyebrow, title, body, detail, delay = 0 }: { eyebrow: string; title: ReactNode; body: string; detail?: ReactNode; delay?: number }) {
  const frame = useCurrentFrame()
  return <div className="scene-copy" style={appear(frame, delay)}>
    <div className="section-eyebrow"><span className="eyebrow-line"/>{eyebrow}</div>
    <h2>{title}</h2>
    <p>{body}</p>
    {detail && <div className="scene-detail" style={appear(frame, delay + 14, 12)}>{detail}</div>}
  </div>
}

function WindowHeader({ name, compact = false }: { name: string; compact?: boolean }) {
  return <div className="window-header"><div className="window-dots"><i/><i/><i/></div><span>{name}</span>{!compact && <div className="window-header-end"><span>TopNote</span><ChevronDown size={15}/></div>}</div>
}

function Intro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 86 }, from: 0.72, to: 1 })
  return <Scene duration={120}>
    <div className="intro-center">
      <div className="intro-logo" style={{ ...appear(frame, 3, 35), transform: `scale(${logoScale})` }}><Logo size={178}/></div>
      <div className="intro-overline" style={appear(frame, 13)}>CAPTURE O QUE IMPORTA</div>
      <h1 style={appear(frame, 19)}>TopNote</h1>
      <p style={appear(frame, 29)}>Suas ideias, sempre ao alcance.</p>
      <div className="intro-shortcut" style={appear(frame, 43, 18)}><span>Ctrl</span><b>+</b><span>Shift</span><b>+</b><span>Space</span></div>
    </div>
    <div className="intro-accent intro-accent-left"/><div className="intro-accent intro-accent-right"/>
  </Scene>
}

function QuickCapture() {
  const frame = useCurrentFrame()
  const title = 'Planejar a semana'
  const body = 'Ideias para a próxima reunião.\n• Revisar prioridades\n• Compartilhar próximos passos'
  const titleLength = Math.max(0, Math.min(title.length, Math.floor((frame - 40) * 0.68)))
  const bodyLength = Math.max(0, Math.min(body.length, Math.floor((frame - 76) * 1.25)))
  const saved = frame >= 148
  return <Scene duration={210}>
    <BrandHeader number="01" label="CAPTURA"/>
    <SceneCopy eyebrow="NOTAS RÁPIDAS" title={<>Capture sem<br/><em>interromper.</em></>} body="Abra uma nota de qualquer lugar, escreva e siga em frente. O TopNote salva automaticamente." detail={<div className="shortcut-chip">Ctrl + Shift + Space <ArrowRight size={22}/></div>} delay={10}/>
    <div className="quick-stage" style={appear(frame, 20, 44)}>
      <div className="quick-capsule"><Logo size={34}/><strong>TopNote</strong><ChevronDown size={21}/></div>
      <div className="mock-window quick-window">
        <WindowHeader name="TopNote · Nota rápida" compact/>
        <div className="quick-window-inner">
          <div className="quick-top"><span><i/>Inbox <ChevronDown size={15}/></span><div><Search size={21}/><Settings size={21}/></div></div>
          <div className="quick-kicker">NOTA RÁPIDA</div>
          <div className="quick-title">{title.slice(0, titleLength)}{titleLength < title.length && frame > 40 && <span className="caret"/>}</div>
          <div className="quick-toolbar"><b>B</b><i>I</i><u>U</u><span>≡</span><span>☷</span><span>⌁</span><Paperclip size={20}/></div>
          <div className="quick-body">{body.slice(0, bodyLength).split('\n').map((line, index) => <div key={index}>{line || '\u00a0'}</div>)}</div>
          <div className="quick-footer"><span><Paperclip size={23}/> <span>Imagem</span><span>Lista</span></span><span className={saved ? 'saved' : 'saving'}>{saved ? <><Check size={19}/> Salvo</> : 'Salvando…'}</span></div>
        </div>
      </div>
    </div>
  </Scene>
}

function SidebarItem({ icon: Icon, label, active = false, indent = false }: { icon: typeof Inbox; label: string; active?: boolean; indent?: boolean }) {
  return <div className={`sidebar-item ${active ? 'active' : ''} ${indent ? 'indent' : ''}`}><Icon size={19}/><span>{label}</span></div>
}

function Workspace() {
  const frame = useCurrentFrame()
  const selected = frame > 118 ? 1 : 0
  return <Scene duration={240}>
    <BrandHeader number="02" label="ORGANIZAÇÃO"/>
    <SceneCopy eyebrow="WORKSPACE" title={<>Tudo no<br/><em>seu lugar.</em></>} body="Projetos, pastas e notas em uma biblioteca simples de navegar." detail={<div className="feature-pills"><span><Layers3 size={18}/> Projetos</span><span><Folder size={18}/> Pastas</span></div>} delay={10}/>
    <div className="workspace-stage" style={appear(frame, 16, 50)}>
      <div className="mock-window workspace-window">
        <WindowHeader name="TopNote · Workspace"/>
        <div className="workspace-columns">
          <aside className="workspace-side"><div className="workspace-logo"><Logo size={31}/><strong>TopNote</strong></div><small>BIBLIOTECA</small><SidebarItem icon={Inbox} label="Inbox"/><SidebarItem icon={Star} label="Favoritos"/><SidebarItem icon={Clock3} label="Recentes"/><SidebarItem icon={Archive} label="Arquivo"/><small className="project-head">PROJETOS <Plus size={18}/></small><SidebarItem icon={FolderOpen} label="Produto" active/><SidebarItem icon={Folder} label="Planejamento" indent/><div className="workspace-local"><i/> Seus dados ficam neste computador</div></aside>
          <div className="workspace-list"><div className="workspace-breadcrumb">TOPNOTE / BIBLIOTECA</div><h3>Produto</h3><div className="workspace-count">3 notas</div>{['Planejamento semanal','Ideias de campanha','Briefing de design'].map((note, index) => <div key={note} className={`note-list-row ${selected === index ? 'selected' : ''}`}><strong>{note}</strong><span>{index === 0 ? 'Prioridades e próximos passos…' : index === 1 ? 'Conceitos para apresentar…' : 'Elementos visuais e referências…'}</span><small>Produto · hoje</small></div>)}</div>
          <div className="workspace-note"><div className="workspace-note-toolbar"><span>Produto <ChevronDown size={15}/></span><span><Search size={20}/><Star size={20}/><MoreHorizontal size={20}/></span></div><div className="workspace-note-content"><div className="workspace-note-kicker">PRODUTO</div><h3>{selected === 0 ? 'Planejamento semanal' : 'Ideias de campanha'}</h3><p>{selected === 0 ? 'Organize as prioridades da semana sem perder o contexto.' : 'Centralize conceitos, referências e decisões no mesmo lugar.'}</p><div className="mock-check"><CheckCheck size={20}/> Revisar pauta com a equipe</div><div className="mock-check"><CheckCheck size={20}/> Definir próximos passos</div></div></div>
        </div>
      </div>
    </div>
  </Scene>
}

function Attachments() {
  const frame = useCurrentFrame()
  const progress = interpolate(frame, [70, 132], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const fileX = interpolate(progress, [0, 1], [0, 460])
  const fileY = interpolate(progress, [0, 1], [0, 138])
  const fileScale = interpolate(progress, [0, 1], [1, 0.86])
  return <Scene duration={210}>
    <BrandHeader number="03" label="ANEXOS"/>
    <SceneCopy eyebrow="ARQUIVOS NA NOTA" title={<>Leve seus arquivos<br/><em>com você.</em></>} body="Anexe por arraste. Abra, encontre no Explorer ou copie para outra pasta." detail={<div className="feature-pills"><span><Paperclip size={18}/> Anexos</span><span><ShieldCheck size={18}/> Arquivos locais</span></div>} delay={10}/>
    <div className="attachments-stage" style={appear(frame, 15, 40)}>
      <div className="attachment-demo-window mock-window"><WindowHeader name="TopNote · Anexos" compact/><div className="attachment-demo-inner"><div className="attachment-demo-heading"><Paperclip size={23}/> Anexos <span>1</span></div><div className="attachment-source-row"><div className="pdf-badge">PDF</div><div><strong>briefing.pdf</strong><small>240 KB</small></div><div className="attachment-actions-mock"><FolderOpen size={21}/><MoreHorizontal size={21}/></div></div><div className="attachment-demo-hint">Arraste um anexo pelo nome para copiá-lo.</div></div></div>
      <div className="drop-trail" style={{ opacity: interpolate(frame, [48, 70, 130], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}><ArrowDownRight size={46}/></div>
      <div className="explorer-card"><div className="explorer-card-head"><FolderOpen size={24}/> Explorer</div><div className="explorer-folder"><Folder size={64}/><span>Documentos</span></div><div className="explorer-drop">{progress > 0.95 ? <><Check size={18}/> Arquivo copiado</> : 'Solte aqui para copiar'}</div></div>
      {frame >= 70 && frame <= 145 && <div className="floating-file" style={{ transform: `translate(${fileX}px, ${fileY}px) scale(${fileScale})`, opacity: frame > 138 ? interpolate(frame, [138, 145], [1, 0]) : 1 }}><div className="pdf-badge">PDF</div><span>briefing.pdf</span></div>}
    </div>
  </Scene>
}

function Outro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const scale = spring({ frame, fps, from: 0.85, to: 1, config: { damping: 16 } })
  return <Scene duration={120}>
    <div className="outro-center">
      <div className="outro-logo" style={{ ...appear(frame, 1), transform: `scale(${scale})` }}><Logo size={150}/></div>
      <div className="outro-eyebrow" style={appear(frame, 10)}>TOPNOTE PARA WINDOWS</div>
      <h2 style={appear(frame, 16)}>Capture. Organize. Continue.</h2>
      <p style={appear(frame, 24)}>Suas notas em foco. Seus dados com você.</p>
      <div className="outro-cta" style={appear(frame, 35)}><span>Conheça o TopNote</span><ArrowRight size={24}/></div>
      <div className="outro-url" style={appear(frame, 43)}>github.com/EmanuelCandido/TopNote</div>
    </div>
  </Scene>
}

export function TopNotePromo() {
  const frame = useCurrentFrame()
  const shimmer = interpolate(frame, [0, 900], [0, 1600])
  return <AbsoluteFill className="promo-root">
    <div className="backdrop-grid"/>
    <div className="backdrop-glow glow-a" style={{ transform: `translateX(${shimmer * 0.07}px)` }}/>
    <div className="backdrop-glow glow-b" style={{ transform: `translateX(${-shimmer * 0.05}px)` }}/>
    <Sequence from={0} durationInFrames={120}><Intro/></Sequence>
    <Sequence from={120} durationInFrames={210}><QuickCapture/></Sequence>
    <Sequence from={330} durationInFrames={240}><Workspace/></Sequence>
    <Sequence from={570} durationInFrames={210}><Attachments/></Sequence>
    <Sequence from={780} durationInFrames={120}><Outro/></Sequence>
    <div className="video-progress"><span style={{ width: `${(frame / 899) * 100}%` }}/></div>
    <div className="illustrative-note">Apresentação ilustrativa do aplicativo</div>
  </AbsoluteFill>
}
