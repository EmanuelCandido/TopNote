/** Original, deterministic score and UI foley. No samples or third-party music. */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DURATION, FPS, SCENES } from '../src/storyboard.ts'

const rate = 48000
const seconds = DURATION / FPS
const length = Math.ceil(seconds * rate)
const left = new Float64Array(length)
const right = new Float64Array(length)
const tau = Math.PI * 2
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
let seed = 271828
function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1 }
function add(at, duration, fn, gain = 1, pan = 0) {
  const start = Math.round(at * rate)
  const count = Math.min(Math.ceil(duration * rate), length - start)
  const l = Math.sqrt((1 - pan) / 2) * gain, r = Math.sqrt((1 + pan) / 2) * gain
  for (let i = 0; i < count; i++) {
    const sample = fn(i / rate, i)
    left[start + i] += sample * l
    right[start + i] += sample * r
  }
}
function bell(at, midi, gain = 0.1, pan = 0) {
  const frequency = hz(midi)
  const duration = 1.65
  const voice = (t) => (1 - Math.exp(-t * 280)) * Math.exp(-t * 4.8) *
    (Math.sin(tau * frequency * t) + 0.22 * Math.sin(tau * frequency * 2.002 * t) * Math.exp(-t * 6) + 0.055 * Math.sin(tau * frequency * 3 * t))
  add(at, duration, voice, gain, pan)
  add(at + .3, duration, voice, gain * .19, -pan)
  add(at + .6, duration, voice, gain * .075, pan)
}
function pad(at, notes, duration = 3) {
  for (const [index, midi] of notes.entries()) {
    const frequency = hz(midi)
    add(at, duration, (t) => {
      const attack = Math.min(1, t / .55)
      const release = Math.min(1, (duration - t) / .85)
      return attack * release * (.63 * Math.sin(tau * frequency * t) + .25 * Math.sin(tau * frequency * 1.0018 * t) + .09 * Math.sin(tau * frequency * 2 * t))
    }, .053, (index - (notes.length - 1) / 2) * .34)
  }
}
function kick(at, gain = .23) {
  add(at, .32, (t) => Math.sin(tau * (47 * t + 4.7 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 18) * Math.min(1, t * 550), gain)
}
function tick(at, gain = .07, pan = 0) {
  let low = 0
  add(at, .055, (t) => { const n = noise(); low = .88 * low + .12 * n; return (n - low) * Math.exp(-t * 110) * Math.min(1, t * 1500) }, gain, pan)
}
function whoosh(at, gain = .095) {
  let low = 0
  add(Math.max(0, at - .24), .6, (t) => {
    low = .945 * low + .055 * noise()
    return low * Math.sin(Math.PI * t / .6) ** 2 * (1 + .3 * Math.sin(tau * 62 * t))
  }, gain * 5, -.1)
}
function click(at) {
  tick(at, .075, .22)
  add(at, .09, (t) => Math.sin(tau * 740 * t) * Math.exp(-t * 72), .028)
}

// Dmaj9 → Bm7 → Gmaj9 → Asus4. A restrained 100 BPM pulse, 64 beats.
const chords = [[50, 57, 61, 66, 69], [47, 54, 57, 62, 66], [43, 54, 57, 62, 66], [45, 52, 57, 62, 64]]
for (let bar = 0; bar < 14; bar++) {
  const at = bar * 2.4
  const notes = chords[bar % chords.length]
  pad(at, notes, 3.05)
  for (const [i, step] of [0, 1.5, 2.5, 3.25].entries()) {
    if (at + step * .6 > 32) continue
    bell(at + step * .6, notes[[2, 4, 3, 1][i]] + 12, bar < 2 ? .105 : .087, [-.35, .35, -.15, .22][i])
  }
}
for (let beat = 7; beat < 49; beat++) {
  const at = beat * .6
  if (beat % 2 === 1) kick(at, .22)
  if (beat % 4 === 3) {
    tick(at, .115, -.05)
    add(at, .11, (t) => Math.sin(tau * 185 * t) * Math.exp(-t * 34), .033)
  }
  tick(at + .3, beat % 2 ? .029 : .044, beat % 2 ? .3 : -.3)
  if (beat % 4 === 1) bell(at, chords[Math.floor(beat / 4) % 4][0], .11)
}
// A quieter resolve lets the closing title breathe.
pad(32.4, [50, 57, 61, 66, 69], 5.85)
bell(32.4, 74, .115, -.25)
bell(33, 78, .105, .25)
bell(33.6, 81, .1, -.08)
bell(34.8, 86, .11, .2)
for (const scene of SCENES.slice(1)) whoosh(scene.from / FPS)
for (const keyFrame of [55, 60, 65]) click((252 + keyFrame) / FPS)
whoosh((252 + 98) / FPS, .042)
for (let f = 145; f < 269; f += 5 + (f % 3)) tick((252 + f) / FPS, .037, (f % 5) / 10 - .2)
bell((252 + 280) / FPS, 86, .047, .2)
for (const f of [75, 126, 228, 332]) click((612 + f) / FPS)
for (const f of [24, 29, 206]) click((1044 + f) / FPS)
for (const f of [64, 72, 80, 88, 96]) tick((1044 + f) / FPS, .04)
for (const f of [65, 141, 228, 330]) click((1332 + f) / FPS)
bell((1332 + 141) / FPS, 81, .046)
bell((1332 + 330) / FPS, 86, .06)

// Peak normalization with gentle limiting; no clipping and a clean tail.
let peak = 0
for (let i = 0; i < length; i++) {
  const t = i / rate
  const fade = Math.min(1, t / .1, (seconds - t) / 1.8)
  left[i] = Math.tanh(left[i] * 1.15) * fade
  right[i] = Math.tanh(right[i] * 1.15) * fade
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
}
const wav = Buffer.alloc(44 + length * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(length * 4, 40)
const gain = .77 / peak
let energy = 0
for (let i = 0; i < length; i++) {
  const l = left[i] * gain, r = right[i] * gain
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4)
  wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4)
  energy += (l * l + r * r) / 2
}
const output = fileURLToPath(new URL('../public/topnote-astra-score.wav', import.meta.url))
await mkdir(fileURLToPath(new URL('../public/', import.meta.url)), { recursive: true })
await writeFile(output, wav)
console.log(JSON.stringify({ output, seconds, sampleRate: rate, channels: 2, peakDb: +(20 * Math.log10(.77)).toFixed(1), rmsDb: +(20 * Math.log10(Math.sqrt(energy / length))).toFixed(1) }))
