import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api } from '../services/api'
import type { Settings } from '../types'

export function previewTransparency(value: string) {
  const transparency = Number(value)
  const amount = Math.min(70, Math.max(0, Number.isFinite(transparency) ? transparency : 45))
  document.documentElement.style.setProperty('--glass-opacity', String(1 - amount / 100))
}

export function useAppearance() {
  useEffect(() => {
    let active = true
    let preferences: Settings = {}
    let stop: (() => void) | undefined
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      if (!active) return
      const theme = preferences.theme ?? 'dark'
      const root = document.documentElement
      root.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      root.dataset.motion = preferences.animations === 'false' ? 'reduced' : 'normal'
      const scale = Number(preferences.scale ?? 100)
      previewTransparency(preferences.transparency ?? '45')
      root.style.fontSize = `${16 * Math.min(150,Math.max(80,Number.isFinite(scale) ? scale : 100)) / 100}px`
    }
    const reload = async () => { preferences = await api.settings(); apply() }
    void listen('topnote:appearance', () => { void reload().catch(console.error) }).then(unlisten => { if (active) stop = unlisten; else unlisten() })
    void reload().catch(console.error)
    media.addEventListener('change',apply)
    return () => { active = false; stop?.(); media.removeEventListener('change',apply) }
  }, [])
}
