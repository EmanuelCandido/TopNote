import { useEffect, useRef, useState } from 'react'
import { availableMonitors } from '@tauri-apps/api/window'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { ArrowLeft, Database, Download, FolderOpen, Info, Keyboard, Monitor, Paintbrush, RotateCcw, Settings2 } from 'lucide-react'
import type { Settings as SettingsType } from '../types'
import { previewTransparency } from '../hooks/useAppearance'

type Props = {
  settings: SettingsType
  dataPath: string
  onSet: (key: string, value: string) => Promise<void>
  onBackup: () => Promise<void>
  onRestore: () => Promise<void>
  onBack: () => void
}

export function Settings({ settings, dataPath, onSet, onBackup, onRestore, onBack }: Props) {
  const [monitors, setMonitors] = useState<string[]>([])
  const [autostart, setAutostart] = useState<boolean | null>(null)
  const [autostartBusy, setAutostartBusy] = useState(false)
  const [error,setError] = useState('')
  const fail = (failure: unknown) => setError(String(failure))
  const [hotkey, setHotkey] = useState(settings.hotkey ?? 'Ctrl+Shift+Space')
  const [transparency, setTransparency] = useState(settings.transparency ?? '45')
  const transparencyValue = useRef(transparency)
  const transparencyDirty = useRef(false)
  useEffect(() => {
    let active = true
    void availableMonitors().then(items => { if (active) setMonitors(items.map((m,i) => m.name || `Monitor ${i+1}`)) }).catch(failure => { if (active) fail(failure) })
    void isEnabled().then(enabled => { if (active) setAutostart(enabled) }).catch(failure => { if (active) fail(failure) })
    return () => { active = false }
  }, [])
  useEffect(() => setHotkey(settings.hotkey ?? 'Ctrl+Shift+Space'), [settings.hotkey])
  useEffect(() => { if (!transparencyDirty.current) { const next = settings.transparency ?? '45'; transparencyValue.current = next; setTransparency(next) } }, [settings.transparency])
  const value = (key: string, fallback: string) => settings[key] ?? fallback
  const change = (key: string, next: string) => { void onSet(key,next).catch(fail) }
  const changeTransparency = (next: string) => {
    transparencyDirty.current = true
    transparencyValue.current = next
    setTransparency(next)
    previewTransparency(next)
  }
  const saveTransparency = () => {
    if (!transparencyDirty.current) return
    transparencyDirty.current = false
    const next = transparencyValue.current
    void onSet('transparency',next).catch(failure => {
      fail(failure)
      if (transparencyValue.current === next && !transparencyDirty.current) {
        const previous = settings.transparency ?? '45'
        transparencyValue.current = previous
        setTransparency(previous)
        previewTransparency(previous)
      }
    })
  }
  const toggle = (key: string, fallback = false) => change(key, String(value(key,String(fallback)) !== 'true'))
  const updateAutostart = async () => {
    if (autostart === null || autostartBusy) return
    setAutostartBusy(true)
    setError('')
    try {
      if (autostart) await disable()
      else await enable()
      setAutostart(await isEnabled())
    } catch (failure) {
      fail(failure)
      void isEnabled().then(setAutostart).catch(fail)
    } finally { setAutostartBusy(false) }
  }
  return <section className="settings-page"><div className="settings-header"><button className="icon-button" onClick={onBack} title="Voltar"><ArrowLeft size={18}/></button><div><div className="eyebrow">Preferências</div><h1>Configurações</h1></div></div><div className="settings-scroll">
    <Group icon={Settings2} title="Geral"><Toggle label="Iniciar com o Windows" checked={autostart === true} disabled={autostart === null || autostartBusy} onChange={() => { void updateAutostart() }} /><Toggle label="Minimizar para a tray ao fechar" checked={value('trayOnClose','true') === 'true'} onChange={() => toggle('trayOnClose',true)} /><Toggle label="Mostrar cápsula ao iniciar" checked={value('showCapsuleAtStart','true') === 'true'} onChange={() => toggle('showCapsuleAtStart',true)} /><p className="settings-hint">Se a inicialização automática estiver ativa, o TopNote abre ao entrar no Windows. A opção acima define se a cápsula aparece ou se ele fica na bandeja.</p></Group>
      <Group icon={Paintbrush} title="Aparência"><Row label="Tema"><select value={value('theme','dark')} onChange={event => change('theme',event.target.value)}><option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Sistema</option></select></Row><Row label="Transparência"><input type="range" min="0" max="70" step="5" value={transparency} onChange={event => changeTransparency(event.target.value)} onPointerUp={saveTransparency} onPointerCancel={saveTransparency} onKeyUp={saveTransparency} onBlur={saveTransparency} aria-label="Transparência"/><span className="range-value">{transparency}%</span></Row><Toggle label="Desfoque do Windows" checked={value('blur','true') === 'true'} onChange={() => toggle('blur',true)} /><p className="settings-hint">O Windows define a intensidade do desfoque. Para funcionar, ative “Efeitos de transparência” em Personalização → Cores. Com o desfoque desligado, o fundo permanece transparente.</p><Row label="Escala"><select value={value('scale','100')} onChange={event => change('scale',event.target.value)}><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option></select></Row><Toggle label="Animações" checked={value('animations','true') === 'true'} onChange={() => toggle('animations',true)} /></Group>
    <Group icon={Monitor} title="Cápsula"><Row label="Monitor"><select value={value('monitor','primary')} onChange={event => change('monitor',event.target.value)}><option value="primary">Monitor principal</option>{monitors.map((name,i) => <option key={i} value={i}>{name}</option>)}</select></Row><Row label="Sempre no topo"><select value={value('alwaysOnTop','always')} onChange={event => change('alwaysOnTop',event.target.value)}><option value="always">Sempre</option><option value="open">Somente ao abrir</option><option value="never">Nunca</option></select></Row><Toggle label="Recolher ao perder o foco" checked={value('autoHide','false') === 'true'} onChange={() => toggle('autoHide')} /><p className="settings-hint">Arraste a cápsula para escolher uma posição. O TopNote a lembrará na próxima abertura.</p></Group>
    <Group icon={Keyboard} title="Atalhos"><Row label="Abrir ou recolher"><input className="hotkey-input" value={hotkey} onChange={event => setHotkey(event.target.value)} onBlur={() => { if (hotkey !== value('hotkey','Ctrl+Shift+Space')) void onSet('hotkey',hotkey).catch(fail) }} onKeyDown={event => { if (event.key === 'Enter') { event.currentTarget.blur() } }} aria-label="Atalho global" /></Row><p className="settings-hint">Use o formato Ctrl+Shift+Space. Ctrl+K pesquisa, Ctrl+N cria nota e Esc recolhe o painel.</p></Group>
    <Group icon={Database} title="Dados"><Row label="Pasta de dados"><button className="secondary-button" onClick={() => void revealItemInDir(dataPath).catch(fail)}><FolderOpen size={15}/> Abrir pasta</button></Row><div className="data-path" title={dataPath}>{dataPath}</div><Row label="Backup"><button className="secondary-button" onClick={() => void onBackup()}><Download size={15}/> Criar backup</button><button className="secondary-button" onClick={() => void onRestore()}><RotateCcw size={15}/> Restaurar</button></Row><Toggle label="Backup automático" checked={value('backupAuto','false') === 'true'} onChange={() => toggle('backupAuto')} /><Row label="Periodicidade"><select value={value('backupInterval','daily')} onChange={event => change('backupInterval',event.target.value)}><option value="daily">Diariamente</option><option value="weekly">Semanalmente</option></select></Row><Row label="Manter"><select value={value('backupMax','5')} onChange={event => change('backupMax',event.target.value)}><option value="5">5 backups</option><option value="10">10 backups</option><option value="20">20 backups</option></select></Row></Group>
    <Group icon={Info} title="Sobre"><Row label="TopNote"><span className="setting-static">Versão 0.1.1</span></Row><p className="settings-hint">Suas notas são armazenadas localmente. Sem conta e sem conexão com a nuvem.</p></Group>
  </div>{error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')}>Fechar</button></div>}</section>
}

function Group({ icon: Icon, title, children }: { icon: typeof Settings2; title: string; children: React.ReactNode }) { return <div className="settings-group"><h2><Icon size={17}/>{title}</h2><div className="settings-group-body">{children}</div></div> }
function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="setting-row"><label>{label}</label><div className="setting-control">{children}</div></div> }
function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) { return <div className="setting-row"><label>{label}</label><button className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}><span/></button></div> }
