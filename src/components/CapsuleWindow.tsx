import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Mode } from '../types'
import { Capsule } from './Capsule'
import { useAppearance } from '../hooks/useAppearance'

export function CapsuleWindow() {
  useAppearance()
  const [mode, setMode] = useState<Mode>('capsule')
  const [hovered,setHovered] = useState(false)
  useEffect(() => { void invoke('set_capsule_active',{active:hovered || mode === 'quick'}).catch(console.error) },[hovered,mode])

  useEffect(() => {
    let active = true
    let movedTimer: ReturnType<typeof setTimeout> | undefined
    const stops: (() => void)[] = []
    void Promise.all([
      invoke<Mode>('get_window_mode').then(current => { if (active) setMode(current) }),
      listen<Mode>('topnote:mode', event => { if (active) setMode(event.payload) }).then(stop => { if (active) stops.push(stop); else stop() }),
      getCurrentWindow().onMoved(() => {
        clearTimeout(movedTimer)
        movedTimer = setTimeout(() => {
          void getCurrentWindow().outerPosition().then(position => Promise.all([
            invoke('set_setting', { key:'capsuleX', value:String(position.x) }),
            invoke('set_setting', { key:'capsuleY', value:String(position.y) }),
          ])).catch(console.error)
        }, 200)
      }).then(stop => { if (active) stops.push(stop); else stop() }),
    ]).catch(console.error)
    return () => { active = false; clearTimeout(movedTimer); stops.forEach(stop => stop()) }
  }, [])

  async function change() {
    try { await emitTo('main','topnote:request-mode','toggle') }
    catch (error) { console.error(error) }
  }
  async function navigate(action: 'new' | 'favorites') {
    try { await emitTo('main','topnote:navigate', action) }
    catch (error) { console.error(error) }
  }

  return <div className="app app-capsule" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}><Capsule expanded={mode === 'quick'} onOpen={() => { void change() }} onNew={() => { void navigate('new') }} onFavorites={() => { void navigate('favorites') }}/></div>
}
