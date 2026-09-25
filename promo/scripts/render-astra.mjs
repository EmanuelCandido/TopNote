import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(project, '../media')
const mode = process.argv[2] ?? 'video'
const chrome = process.env.REMOTION_BROWSER_EXECUTABLE ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
const browser = chrome ? { browserExecutable: chrome } : {}
if (!existsSync(path.join(project, 'public/topnote-astra-score.wav'))) await import('./score.mjs')
const serveUrl = await bundle({ entryPoint: path.join(project, 'src/index.ts'), publicDir: path.join(project, 'public') })
const composition = await selectComposition({ serveUrl, id: 'TopNoteAstra', ...browser })
await mkdir(output, { recursive: true })
if (mode === 'stills') {
  const directory = path.join(output, 'astra-review')
  await mkdir(directory, { recursive: true })
  // Action starts/ends and one settled frame from every scene.
  for (const frame of [170, 318, 480, 583, 724, 870, 999, 1220, 1285, 1460, 1540, 1618, 1715, 1900, 2180]) {
    await renderStill({ serveUrl, composition, frame, output: path.join(directory, `${frame}.jpg`), imageFormat: 'jpeg', jpegQuality: 88, ...browser })
    console.log(`Frame ${frame}: ${(frame / 60).toFixed(2)}s`)
  }
} else if (mode === 'poster') {
  await renderStill({ serveUrl, composition, frame: 170, output: path.join(output, 'TopNote-Astra-poster.png'), imageFormat: 'png', ...browser })
  console.log('Poster rendered')
} else {
  let lastPercent = -1
  await renderMedia({
    serveUrl, composition, outputLocation: path.join(output, 'TopNote-Astra.mp4'),
    codec: 'h264', crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '256k',
    concurrency: 4, ...browser,
    onProgress: ({ progress }) => { const percent = Math.floor(progress * 100 / 10) * 10; if (percent !== lastPercent) { lastPercent = percent; console.log(`Rendering ${percent}%`) } },
  })
  console.log('TopNote-Astra.mp4 rendered')
}
