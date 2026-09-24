import { afterEach, expect, test, vi } from 'vitest'
import { Autosave } from './autosave'
import type { NotePatch, SaveStatus } from '../types'

const patch = (title: string): NotePatch => ({ id: '1', title, contentJson: '{"type":"doc"}', contentText: title, projectId: null, folderId: null })
afterEach(() => vi.useRealTimers())
test('debounces typing and saves the latest revision', async () => {
  vi.useFakeTimers()
  const saved: string[] = []
  const autosave = new Autosave(async p => { saved.push(p.title) }, () => {}, () => {})
  autosave.schedule(patch('a'))
  vi.advanceTimersByTime(300)
  autosave.schedule(patch('abc'))
  await vi.advanceTimersByTimeAsync(550)
  expect(saved).toEqual(['abc'])
  expect(autosave.hasPending()).toBe(false)
})
test('flush saves immediately and reports failure for retry', async () => {
  vi.useFakeTimers()
  let fail = true
  const statuses: SaveStatus[] = []
  const autosave = new Autosave(async () => { if (fail) throw new Error('disk'); }, s => statuses.push(s), () => {})
  autosave.schedule(patch('draft'))
  expect(await autosave.flush()).toBe(false)
  expect(autosave.hasPending()).toBe(true)
  fail = false
  expect(await autosave.flush()).toBe(true)
  expect(statuses).toEqual(['saving', 'error', 'saved'])
})

test('concurrent close requests drain newer edits once and in order', async () => {
  const saved: string[] = []
  let release: () => void = () => {}
  const firstWrite = new Promise<void>(resolve => { release = resolve })
  const autosave = new Autosave(async p => {
    saved.push(p.title)
    if (p.title === 'first') await firstWrite
  }, () => {}, () => {})
  autosave.schedule(patch('first'))
  const closing = autosave.flush()
  autosave.schedule(patch('latest'))
  const hiding = autosave.flush()
  release()
  expect(await Promise.all([closing,hiding])).toEqual([true,true])
  expect(saved).toEqual(['first','latest'])
  expect(autosave.hasPending()).toBe(false)
  autosave.dispose()
})
