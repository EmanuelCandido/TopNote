import { useState } from 'react'
import { ArrowRight, Command, FolderKanban, Sparkles } from 'lucide-react'
import { BrandIcon } from './BrandIcon'

export function Onboarding({ onFinish }: { onFinish: (example: boolean) => Promise<void> }) {
  const [step, setStep] = useState(0)
  const pages = [
    { icon: Sparkles, eyebrow: 'Bem-vindo', title: 'Uma ideia, antes que ela passe.', body: 'O TopNote fica ao alcance da mão para capturar pensamentos sem interromper seu trabalho.' },
    { icon: Command, eyebrow: 'Capture em segundos', title: 'Sempre a um atalho de distância.', body: 'Pressione Ctrl + Shift + Space de qualquer lugar para abrir uma nota. Digite e feche com Esc. Tudo é salvo automaticamente.' },
    { icon: FolderKanban, eyebrow: 'Organize no seu tempo', title: 'Anote agora. Organize depois.', body: 'Novas notas começam na Inbox. Quando quiser, mova para um projeto ou pasta no Workspace.' },
  ]
  const page = pages[step]
  return <div className="onboarding"><div className="onboarding-glow"/><div className="onboarding-top"><BrandIcon/><span>TopNote</span></div><div className="onboarding-content"><div className="onboarding-symbol"><page.icon size={30} strokeWidth={1.5}/></div><div className="eyebrow">{page.eyebrow}</div><h1>{page.title}</h1><p>{page.body}</p>{step === 1 && <kbd className="big-shortcut">Ctrl + Shift + Space</kbd>}</div><div className="onboarding-bottom"><div className="onboarding-dots">{pages.map((_,i) => <span key={i} className={i === step ? 'active' : ''}/>)}</div>{step < 2 ? <button className="primary-button" onClick={() => setStep(i => i+1)}>Continuar <ArrowRight size={16}/></button> : <div className="onboarding-choices"><button className="subtle-button" onClick={() => void onFinish(false)}>Começar vazio</button><button className="primary-button" onClick={() => void onFinish(true)}>Criar projeto de exemplo <ArrowRight size={16}/></button></div>}</div></div>
}
