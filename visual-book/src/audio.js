// Geluid, volledig gegenereerd met de Web Audio API (geen bestanden, geen licenties). Standaard UIT.
let ctx = null
let aan = false

const start = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)())

function ruisBuffer(sec) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function ruis({ sec = 0.3, freq = 2000, q = 1, type = 'bandpass', vol = 0.2, verval = sec }) {
  const bron = ctx.createBufferSource()
  bron.buffer = ruisBuffer(sec)
  const f = ctx.createBiquadFilter()
  f.type = type; f.frequency.value = freq; f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + verval)
  bron.connect(f).connect(g).connect(ctx.destination)
  bron.start()
}

function toon({ freq = 880, sec = 0.4, vol = 0.12, type = 'sine', naar = null }) {
  const o = ctx.createOscillator()
  o.type = type; o.frequency.value = freq
  if (naar) o.frequency.exponentialRampToValueAtTime(naar, ctx.currentTime + sec)
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + sec)
  o.connect(g).connect(ctx.destination)
  o.start(); o.stop(ctx.currentTime + sec)
}

const als = (fn) => (...a) => { if (aan && ctx) try { fn(...a) } catch { /* geluid mag nooit iets breken */ } }

export const geluid = {
  get aan() { return aan },
  zet(v) { aan = v; if (v) start().resume() },
  pagina: als(() => ruis({ sec: 0.35, freq: 3200, q: 0.7, vol: 0.18 })),
  veer: als(() => ruis({ sec: 0.5, freq: 6000, q: 3, vol: 0.05 })),
  sis: als(() => ruis({ sec: 0.6, freq: 5000, type: 'highpass', vol: 0.08 })),
  kling: als(() => { toon({ freq: 1320, sec: 0.5, vol: 0.06 }); toon({ freq: 1980, sec: 0.35, vol: 0.03 }) }),
  klap: als(() => { toon({ freq: 120, naar: 40, sec: 0.35, vol: 0.4, type: 'triangle' }); ruis({ sec: 0.2, freq: 400, vol: 0.3 }) }),
  glitch: als(() => { for (let i = 0; i < 4; i++) setTimeout(() => toon({ freq: 200 + Math.random() * 1800, sec: 0.05, vol: 0.05, type: 'square' }), i * 40) }),
  scheur: als(() => ruis({ sec: 0.5, freq: 1500, q: 0.4, vol: 0.25 })),
}
