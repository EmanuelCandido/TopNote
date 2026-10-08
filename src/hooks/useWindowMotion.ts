import { useEffect, useRef, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { Mode } from '../types'

export type WindowMotion = { phase: 'opening' | 'closing' | 'idle'; width: number; height: number; anchor: 'center' | 'left' | 'right' }

const idle: WindowMotion = { phase: 'idle', width: 0, height: 0, anchor: 'center' }

/** Tracks the native window spring so the panel keeps its final size while the window grows or folds. */
export function useWindowMotion(mode: Mode) {
  const [motion, setMotion] = useState(idle)
  const ref = useRef(motion)
  ref.current = motion

  useEffect(() => {
    let active = true
    let stop: (() => void) | undefined
    // Only this window's springs: the editor and the projects panel move independently.
    let settle: ReturnType<typeof setTimeout> | undefined
    void getCurrentWebviewWindow().listen<WindowMotion>('topnote:window-motion', event => {
      if (!active) return
      clearTimeout(settle)
      // An opening ends while its content is still settling; keep the motion layout a moment longer.
      if (event.payload.phase === 'idle' && ref.current.phase === 'opening') settle = setTimeout(() => { if (active) setMotion(event.payload) }, 180)
      else setMotion(event.payload)
    })
      .then(unlisten => { if (active) stop = unlisten; else unlisten() })
    return () => { active = false; clearTimeout(settle); stop?.() }
  }, [])

  // A spring cancelled by a newer mode change never reports its end.
  useEffect(() => {
    if (motion.phase === 'idle') return
    if (mode === 'workspace' || mode === 'hidden') { setMotion(idle); return }
    const timer = setTimeout(() => setMotion(idle), 1200)
    return () => clearTimeout(timer)
  }, [motion, mode])

  const begin = (phase: WindowMotion['phase']) => {
    const next: WindowMotion = { phase, width: window.innerWidth, height: window.innerHeight, anchor: 'center' }
    ref.current = next
    setMotion(next)
  }
  return { motion, ref, begin }
}
