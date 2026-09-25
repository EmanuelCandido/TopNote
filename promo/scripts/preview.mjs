import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const media = fileURLToPath(new URL('../../media/', import.meta.url))
const port = Number(process.env.TOPNOTE_PROMO_PORT ?? 4396)
const allowed = new Map([
  ['/', ['comparar.html', 'text/html; charset=utf-8']],
  ['/comparar.html', ['comparar.html', 'text/html; charset=utf-8']],
  ...['TopNote-Astra.mp4', 'TopNote-promo.mp4'].map(name => ['/' + name, [name, 'video/mp4']]),
  ...['TopNote-Astra-poster.png', 'TopNote-poster.png'].map(name => ['/' + name, [name, 'image/png']]),
])
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return }
    const pathname = new URL(request.url, 'http://localhost').pathname
    const item = allowed.get(pathname)
    if (!item) { response.writeHead(404).end('Not found'); return }
    const file = path.join(media, item[0])
    const { size } = await stat(file)
    const headers = { 'Content-Type': item[1], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }
    const range = request.headers.range
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': 'bytes */' + size }).end(); return }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
      const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { response.writeHead(416, { 'Content-Range': 'bytes */' + size }).end(); return }
      response.writeHead(206, { ...headers, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 })
      if (request.method === 'HEAD') { response.end(); return }
      createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response)
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': size })
      if (request.method === 'HEAD') { response.end(); return }
      createReadStream(file).on('error', () => response.destroy()).pipe(response)
    }
  } catch { response.writeHead(404).end('Render the video and poster first.') }
})
server.listen(port, '127.0.0.1', () => console.log('TopNote comparison: http://127.0.0.1:' + port))
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
