// The Mending of Achrona: een live visualisatie van het debat van de Council.
// Leest alleen trace.json en verdict.json (via /data/ van de Vite-server) en pollt ze elke seconde.
// Verandert nooit iets aan de trace of het Verdict. Werkt ook met ?map=voorbeeld.
import { gsap } from 'gsap'
import './style.css'

const MAP = new URLSearchParams(location.search).get('map') || ''
const DATA = (naam) => `/data/${naam}${MAP ? `?map=${encodeURIComponent(MAP)}` : ''}`
const POLL_MS = 1000
const ID_RE = /\b[A-Z]{3}[-‐‑‒–—―−]\d{3}\b/g // ook ID's van het voorbeeld (MOL-007)
const normaalID = (id) => id.replace(/[‐‑‒–—―−]/, '-')

const ROLMETA = {
  archmage: { naam: 'Archmage', kleur: '#8B7CF6' },
  engineer: { naam: 'Engineer', kleur: '#38BDF8' },
  guardian_keeper: { naam: 'Guardian Keeper', kleur: '#A3B4C8' },
  historian: { naam: 'Historian', kleur: '#D4A373' },
  oracle: { naam: 'Oracle', kleur: '#E879F9' },
  beast_master: { naam: 'Beast Master', kleur: '#84CC16' },
}
const EXTRA_KLEUREN = ['#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#FB7185']
const meta = (rol, i = 0) => ROLMETA[rol] || {
  naam: String(rol).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  kleur: EXTRA_KLEUREN[i % EXTRA_KLEUREN.length],
}

const $ = (id) => document.getElementById(id)
const el = (tag, attrs = {}, kinderen = []) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'style') e.style.cssText = v
    else if (k === 'text') e.textContent = v
    else e.setAttribute(k, v)
  }
  for (const k of [].concat(kinderen)) if (k != null) e.append(k)
  return e
}
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}
const wacht = (s) => new Promise((r) => gsap.delayedCall(s, r)) // volgt de afspeelsnelheid

// ------------------------------------------------------------------ toestand

const S = {
  trace: null, verdict: null, runId: null,
  pos: 0, // hoeveel beurten zijn al getoond
  spelen: true, snelheid: 1, bezig: false, opnieuw: false, gen: 0,
  leden: [], posities: {}, tegelVoor: new Map(), verdictGetoond: false,
}

// ------------------------------------------------------------------ scheuren (de Desync)

function maakScheuren() {
  const g = $('scheurlijnen')
  let zaad = 7
  const rnd = () => ((zaad = (zaad * 9301 + 49297) % 233280) / 233280)
  const starts = [[0, 120], [0, 520], [0, 800], [1600, 90], [1600, 430], [1600, 760], [260, 0], [1250, 0], [420, 900], [1180, 900]]
  for (const [x0, y0] of starts) {
    let x = x0, y = y0, d = `M${x},${y}`
    const dx = x0 === 0 ? 1 : x0 === 1600 ? -1 : (rnd() - 0.5)
    const dy = y0 === 0 ? 1 : y0 === 900 ? -1 : (rnd() - 0.5)
    for (let i = 0; i < 7; i++) {
      x += dx * (25 + rnd() * 45) + (rnd() - 0.5) * 30
      y += dy * (25 + rnd() * 45) + (rnd() - 0.5) * 30
      d += ` L${x.toFixed(0)},${y.toFixed(0)}`
      if (rnd() < 0.35) g.append(svg('path', { d: `M${x.toFixed(0)},${y.toFixed(0)} l${((rnd() - 0.5) * 70).toFixed(0)},${((rnd() - 0.5) * 70).toFixed(0)}`, 'stroke-width': 1.5 }))
    }
    g.append(svg('path', { d }))
  }
}

let desyncTween = null
function zetDesync(waarde, direct = false) {
  const root = document.documentElement
  const nu = parseFloat(getComputedStyle(root).getPropertyValue('--desync')) || 1
  desyncTween?.kill()
  if (direct) return root.style.setProperty('--desync', waarde.toFixed(3))
  desyncTween = gsap.to({ v: nu }, { v: waarde, duration: 1.2, onUpdate() { root.style.setProperty('--desync', this.targets()[0].v.toFixed(3)) } })
}

// ------------------------------------------------------------------ mozaïek

const TEGELS = []
function maakMozaiek() {
  const m = $('mozaiek')
  m.innerHTML = ''
  TEGELS.length = 0
  const ringen = [[18, 40, 8], [40, 64, 14], [64, 86, 20], [86, 100, 26]]
  let zaad = 11
  const rnd = () => ((zaad = (zaad * 9301 + 49297) % 233280) / 233280)
  const punt = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  for (const [r0, r1, n] of ringen) {
    const off = rnd() * Math.PI
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * 2 * Math.PI, a1 = off + ((i + 1) / n) * 2 * Math.PI, am = (a0 + a1) / 2
      const j = () => (rnd() - 0.5) * 3
      const pts = [punt(r0, a0), punt(r0 + j(), am), punt(r0, a1), punt(r1, a1), punt(r1 + j(), am), punt(r1, a0)]
      const p = svg('polygon', { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), class: 'tegel' })
      const [cx, cy] = punt((r0 + r1) / 2, am)
      m.append(p)
      TEGELS.push({ el: p, cx, cy })
    }
  }
  // vaste, verspreide volgorde waarin tegels vollopen
  for (let i = TEGELS.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [TEGELS[i], TEGELS[k]] = [TEGELS[k], TEGELS[i]]
  }
  m.append(svg('circle', { r: 17, class: 'kern' }))
  const t = svg('text', { y: 3, class: 'kern-getal', id: 'kern-getal' })
  t.textContent = '0'
  const s = svg('text', { y: 10, class: 'kern-tekst', id: 'kern-tekst' })
  s.textContent = 'scherven'
  m.append(t, s)
}

function zetKern(n) {
  $('kern-getal').textContent = n
  $('kern-tekst').textContent = n === 1 ? 'scherf' : 'scherven'
}

function tegelVoor(id) {
  if (!S.tegelVoor.has(id)) S.tegelVoor.set(id, TEGELS[S.tegelVoor.size % TEGELS.length])
  return S.tegelVoor.get(id)
}

function werkKernBij() {
  const n = S.tegelVoor.size
  zetKern(n)
  zetDesync(Math.max(0.12, 1 - Math.min(1, n / 30) * 0.75))
}

async function vliegScherven(ids, rol) {
  const van = S.posities[rol]
  const tafel = $('tafel').getBoundingClientRect()
  const mr = $('mozaiek').getBoundingClientRect()
  const start = van ? [tafel.left + (van.x / 100) * tafel.width, tafel.top + (van.y / 100) * tafel.height] : [mr.left + mr.width / 2, mr.top]
  const nieuw = ids.filter((id) => !S.tegelVoor.has(id))
  nieuw.forEach((id, i) => {
    const tegel = tegelVoor(id)
    const doel = [mr.left + ((tegel.cx + 100) / 200) * mr.width, mr.top + ((tegel.cy + 100) / 200) * mr.height]
    const s = el('div', { class: 'scherf' })
    document.body.append(s)
    gsap.set(s, { left: start[0] - 6, top: start[1] - 6, scale: 0.4, rotation: 0 })
    gsap.timeline({ delay: i * 0.12, onComplete: () => { s.remove(); tegel.el.classList.add('vol') } })
      .to(s, { scale: 1.3, duration: 0.2 })
      .to(s, { left: doel[0] - 6, top: doel[1] - 6, rotation: 270, scale: 0.8, duration: 0.9, ease: 'power2.inOut' })
  })
  if (nieuw.length) await wacht(0.9 + nieuw.length * 0.12)
  werkKernBij()
}

// ------------------------------------------------------------------ leden rond de tafel

function circuit() {
  const c = svg('svg', { class: 'circuit', viewBox: '0 0 100 100' })
  c.append(svg('circle', { cx: 50, cy: 50, r: 48, 'stroke-dasharray': '2 5' }))
  for (const [d, kx, ky] of [['M50 2 V-6 H62', 62, -6], ['M98 50 H106 V40', 106, 40], ['M50 98 V106 H38', 38, 106], ['M2 50 H-6 V60', -6, 60]]) {
    c.append(svg('path', { d }))
    c.append(svg('circle', { cx: kx, cy: ky, r: 2.2, class: 'knoop' }))
  }
  return c
}

function bouwLeden(rollen) {
  const wrap = $('leden')
  wrap.innerHTML = ''
  S.posities = {}
  S.leden = rollen
  const plaatsen = rollen.length + 1 // plaats 0 (boven) is voor de Koning
  rollen.forEach((rol, i) => {
    const hoek = -Math.PI / 2 + ((i + 1) / plaatsen) * 2 * Math.PI
    const x = 50 + 41 * Math.cos(hoek), y = 50 + 41 * Math.sin(hoek)
    S.posities[rol] = { x, y }
    const m = meta(rol, i)
    const img = el('img', { src: `/avatars/${rol}.svg`, alt: m.naam })
    const initiaal = el('div', { class: 'initiaal', text: m.naam[0] })
    initiaal.hidden = true
    img.onerror = () => { img.remove(); initiaal.hidden = false }
    const lid = el('div', { class: 'lid', id: `lid-${rol}`, style: `left:${x}%;top:${y}%;--kleur:${m.kleur}` }, [
      el('div', { class: 'portret' }, [circuit(), img, initiaal]),
      el('div', { class: 'naam', text: m.naam }),
      el('div', { class: 'teller', id: `teller-${rol}`, text: '' }),
    ])
    wrap.append(lid)
  })
}

const kleurVan = (rol) => meta(rol, Math.max(0, S.leden.indexOf(rol))).kleur
const naamVan = (rol) => (rol === 'koning' ? 'De Koning' : rol === 'mens' ? 'Mens' : meta(rol, Math.max(0, S.leden.indexOf(rol))).naam)

// ------------------------------------------------------------------ Koning: spotlight, bevel, mist

function zetSpotlight(rol, direct = false) {
  const p = S.posities[rol]
  const kegel = $('straal-kegel')
  const duur = direct ? 0 : 0.8
  if (!p) {
    gsap.to('#spotlight', { opacity: 0, duration: duur })
    gsap.to(kegel, { attr: { points: '50,10 50,10 50,10' }, duration: duur })
    return
  }
  gsap.to('#spotlight', { left: `${p.x}%`, top: `${p.y}%`, opacity: 1, duration: duur, ease: 'power3.inOut' })
  gsap.to(kegel, { attr: { points: `48,10 52,10 ${p.x + 7},${p.y} ${p.x - 7},${p.y}` }, duration: duur, ease: 'power3.inOut' })
}

function zetBevel(b) {
  if (!b) return ($('bevel').hidden = true)
  $('bevel').hidden = false
  $('bevel-aan').textContent = b.aan ? `Het woord aan de ${naamVan(b.aan)}` : 'De Koning sluit het debat'
  $('bevel-vraag').textContent = b.vraag || ''
  $('bevel-reden').textContent = b.reden ? `Waarom: ${b.reden}` : ''
}

function zetMist(vragen, direct = false) {
  const ul = $('mist')
  ul.innerHTML = ''
  for (const v of vragen || []) ul.append(el('li', { text: v }))
  if (!direct && ul.children.length) gsap.from(ul.children, { opacity: 0, x: -14, filter: 'blur(4px)', stagger: 0.08, duration: 0.6 })
}

// ------------------------------------------------------------------ Raadsleden: bron lezen en spreken

function zetSpreker(rol) {
  document.querySelectorAll('.lid').forEach((e) => e.classList.toggle('spreekt', e.id === `lid-${rol}`))
}

async function leesBron(b, direct = false) {
  const lid = $(`lid-${b.spreker}`)
  const label = b.tool || b.bestand || 'bron'
  $('bronnen').prepend(el('li', { style: `--kleur:${kleurVan(b.spreker)}` }, [el('b', { text: naamVan(b.spreker) }), ` ${label}`]))
  while ($('bronnen').children.length > 8) $('bronnen').lastChild.remove()
  if (direct || !lid) return
  lid.classList.add('leest')
  await wacht(0.7)
  lid.classList.remove('leest')
}

function tekstMetIds(tekst) {
  const frag = document.createDocumentFragment()
  const delen = String(tekst || '').split(/(\s+)/)
  for (const d of delen) {
    if (/^\s+$/.test(d)) { frag.append(d); continue }
    const span = el('span', { class: 'w', text: d.replace(/\*\*/g, '') })
    if (ID_RE.test(d)) span.classList.add('id')
    ID_RE.lastIndex = 0
    frag.append(span)
  }
  return frag
}

async function spreek(b, direct = false) {
  const ballon = $('ballon')
  ballon.hidden = false
  ballon.style.setProperty('--kleur', b.spreker === 'koning' ? '#1D4ED8' : kleurVan(b.spreker))
  $('ballon-naam').textContent = naamVan(b.spreker)
  const p = $('ballon-tekst')
  p.innerHTML = ''
  p.append(tekstMetIds(b.tekst))
  zetSpreker(b.spreker)
  const woorden = p.querySelectorAll('.w')
  const ids = [...new Set((String(b.tekst || '').match(ID_RE) || []).map(normaalID))]
  if (direct) {
    gsap.set(woorden, { opacity: 1 })
    return ids
  }
  ballon.scrollTop = 0
  const per = Math.min(0.06, 7 / Math.max(1, woorden.length))
  gsap.to(woorden, { opacity: 1, duration: 0.25, stagger: per, onUpdate: () => (ballon.scrollTop = ballon.scrollHeight) })
  await Promise.all([wacht(woorden.length * per + 0.3), vliegScherven(ids, b.spreker)])
  return ids
}

function telBeurten(tot) {
  const tel = {}
  for (const b of S.trace.beurten.slice(0, tot)) if (b.soort === 'bericht' && S.posities[b.spreker]) tel[b.spreker] = (tel[b.spreker] || 0) + 1
  for (const rol of S.leden) $(`teller-${rol}`).textContent = tel[rol] ? `${tel[rol]}× gesproken` : ''
}

// ------------------------------------------------------------------ één beurt afspelen

async function speel(b) {
  if (b.soort === 'routering') {
    zetBevel(b)
    zetMist(b.open_vragen)
    zetSpotlight(b.aan)
    zetSpreker(null)
    await wacht(b.aan ? 1.6 : 2.2)
  } else if (b.soort === 'toolcall' || b.soort === 'bestand') {
    await leesBron(b)
  } else if (b.soort === 'bericht') {
    await spreek(b)
    await wacht(0.8)
  }
}

// alles tot en met positie `tot` meteen tonen, zonder animatie (tijdlijn-slider)
function toonTot(tot) {
  S.gen++ // een lopende animatie stopt na haar huidige stap
  gsap.killTweensOf(['#spotlight', '#straal-kegel', '#perkament', '.w', '#mist li', '#bliksem path'])
  document.querySelectorAll('.scherf').forEach((s) => { gsap.killTweensOf(s); s.remove() })
  TEGELS.forEach((t) => t.el.classList.remove('vol'))
  S.tegelVoor.clear()
  $('bronnen').innerHTML = ''
  $('ballon').hidden = true
  $('bliksem').innerHTML = ''
  $('mozaiek').classList.remove('hersteld')
  zetBevel(null); zetMist([], true); zetSpreker(null)
  const beurten = S.trace.beurten.slice(0, tot)
  let laatsteRoutering = null, laatsteBericht = null
  for (const b of beurten) {
    if (b.soort === 'routering') laatsteRoutering = b
    else if (b.soort === 'bericht') {
      laatsteBericht = b
      for (const id of (String(b.tekst || '').match(ID_RE) || []).map(normaalID)) tegelVoor(id).el.classList.add('vol')
    } else if (b.soort === 'toolcall' || b.soort === 'bestand') leesBron(b, true)
  }
  if (laatsteRoutering) { zetBevel(laatsteRoutering); zetMist(laatsteRoutering.open_vragen, true) }
  zetSpotlight(laatsteRoutering?.aan, true)
  if (laatsteBericht) spreek(laatsteBericht, true)
  zetKern(S.tegelVoor.size)
  zetDesync(Math.max(0.12, 1 - Math.min(1, S.tegelVoor.size / 30) * 0.75), true)
  telBeurten(tot)
  if (tot >= S.trace.beurten.length && klaar()) toonEinde(true)
}

// ------------------------------------------------------------------ de speler

// klaar = afgerond (of een trace zonder status, zoals het voorbeeld) en een Verdict uit dezelfde run
const klaar = () => !!S.trace && (S.trace.status ?? 'klaar') === 'klaar' && !!S.verdict && S.verdict.run_id === S.trace.run_id

async function speler() {
  if (S.bezig) { S.opnieuw = true; return }
  S.bezig = true
  const gen = S.gen
  try {
    while (S.spelen && S.trace && S.pos < S.trace.beurten.length && gen === S.gen) {
      const b = S.trace.beurten[S.pos]
      await speel(b)
      if (!S.spelen || gen !== S.gen) break // gepauzeerd, verschoven of nieuwe run tijdens de animatie
      S.pos++
      telBeurten(S.pos)
      werkSchuifBij()
    }
    if (gen === S.gen && S.spelen && S.trace && S.pos >= S.trace.beurten.length && klaar() && !S.verdictGetoond) await toonEinde(false)
  } finally {
    S.bezig = false
    if (S.opnieuw) { S.opnieuw = false; if (S.spelen) speler() }
  }
}

// ------------------------------------------------------------------ einde: geschillen en Verdict

function bliksemPad(a, b) {
  let d = `M${a.x},${a.y}`
  const n = 7
  for (let i = 1; i < n; i++) {
    const t = i / n
    const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 6
    const y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 6
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`
  }
  return d + ` L${b.x},${b.y}`
}

function toonGeschillen(direct) {
  const s = $('bliksem')
  s.innerHTML = ''
  for (const g of S.trace.geschillen || []) {
    const rollen = Object.keys(g.standpunten || {}).filter((r) => S.posities[r])
    for (let i = 0; i + 1 < rollen.length; i++) {
      const pad = svg('path', {
        d: bliksemPad(S.posities[rollen[i]], S.posities[rollen[i + 1]]),
        stroke: '#E8562A', 'stroke-width': 3, fill: 'none', 'vector-effect': 'non-scaling-stroke',
        'stroke-linejoin': 'bevel', style: 'filter: drop-shadow(0 0 6px #E8562A)',
      })
      s.append(pad)
      const beslecht = !!g.uitkomst
      if (direct) gsap.set(pad, { opacity: beslecht ? 0.15 : 0.5 })
      else {
        gsap.timeline({ delay: Math.random() * 0.8 })
          .fromTo(pad, { opacity: 0 }, { opacity: 1, duration: 0.08, repeat: 7, yoyo: true })
          .to(pad, { opacity: beslecht ? 0.15 : 0.55, duration: 1.4, delay: 0.8 })
      }
    }
  }
}

async function toonEinde(direct) {
  S.verdictGetoond = true
  $('knop-verdict').disabled = false
  zetSpotlight(null, direct)
  toonGeschillen(direct)
  const slots = S.verdict.oorzaak || {}
  const gevuld = ['ingreep', 'mechanisme', 'verloop'].filter((k) => slots[k]?.bewering).length
  zetDesync(1 - gevuld / 3 * 0.9, direct)
  if (gevuld === 3) $('mozaiek').classList.add('hersteld')
  if (!direct) {
    await wacht(2.2)
    openPerkament()
  }
}

const idSpan = (tekst) => String(tekst ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  .replace(ID_RE, (m) => `<span class="id">${normaalID(m)}</span>`)
const ids = (lijst) => (lijst || []).map((i) => `<span class="id">${i}</span>`).join(' ')

function laatsteDag() {
  let max = 0
  for (const b of S.trace?.beurten || []) for (const m of String(b.tekst || '').matchAll(/\bdag (\d{1,3})\b/gi)) max = Math.max(max, +m[1])
  return max
}

function openPerkament() {
  const v = S.verdict
  if (!v) return
  const slotNamen = { ingreep: 'Ingreep', mechanisme: 'Mechanisme', verloop: 'Verloop' }
  const slots = Object.entries(slotNamen).map(([k, titel]) => {
    const s = v.oorzaak?.[k] || {}
    if (!s.bewering) return `<div class="slot gebroken"><h4>${titel}</h4><p>Gebroken: de Council kon dit deel niet met bewijs herstellen.</p></div>`
    const z = typeof s.zekerheid === 'number' ? s.zekerheid : null
    return `<div class="slot"><h4>${titel}</h4><p>${idSpan(s.bewering)}</p>
      ${z !== null ? `<div class="zekerheid"><span style="width:${Math.round(z * 100)}%"></span></div><div class="zekerheid-label">zekerheid ${Math.round(z * 100)}%</div>` : ''}
      <p style="margin-top:6px">${ids(s.bewijs)}</p></div>`
  }).join('')
  const acties = (v.acties || []).map((a) => `<li><b>${idSpan(a.actie)}</b><small>${idSpan(a.reden)} ${ids(a.bewijs)}</small></li>`).join('')
  const risicos = (v.risicos || []).map((r) => `<li><b>${idSpan(r.risico)}</b><small>Mitigatie: ${idSpan(r.mitigatie)}</small></li>`).join('')
  let voorspelling = ''
  if (v.voorspelling) {
    const nu = laatsteDag()
    const over = nu ? Math.max(0, v.voorspelling.dag - nu) : null
    const omtrek = 2 * Math.PI * 44
    const deel = over !== null ? Math.min(1, over / 10) : 1
    voorspelling = `<h3>Voorspelling</h3><div class="voorspelling">
      <svg class="klok" viewBox="0 0 100 100"><circle class="achter" cx="50" cy="50" r="44"/>
        <circle class="voor" cx="50" cy="50" r="44" stroke-dasharray="${(omtrek * deel).toFixed(1)} ${omtrek.toFixed(1)}"/>
        <text x="50" y="47" font-size="20">dag ${v.voorspelling.dag}</text>
        <text x="50" y="66" font-size="10">${over !== null ? `nog ${over} ${over === 1 ? 'dag' : 'dagen'}` : ''}</text></svg>
      <div><p>${idSpan(v.voorspelling.bewering)}</p><p>${ids(v.voorspelling.bewijs)}</p></div></div>`
  }
  const geschillen = (S.trace?.geschillen || []).map((g) => `<li class="${g.uitkomst ? 'beslecht' : ''}"><b>${idSpan(g.onderwerp)}</b>
      ${Object.entries(g.standpunten || {}).map(([r, t]) => `<div class="standpunt"><b>${naamVan(r)}:</b> ${idSpan(t)}</div>`).join('')}
      <div class="standpunt"><i>${g.uitkomst ? `Uitkomst: ${idSpan(g.uitkomst)}` : 'Niet beslecht.'}</i> ${ids(g.bewijs)}</div></li>`).join('')

  $('perkament-inhoud').innerHTML = `
    <h2>Council Verdict</h2>
    <p class="run">${idSpan(v.run_id)}</p>
    <p class="samenvatting">${idSpan(v.samenvatting)}</p>
    <h3>De oorzaak</h3><div class="slots">${slots}</div>
    <h3>Herstelplan</h3><ol class="acties">${acties}</ol>
    <h3>Risico's</h3><ul class="risicos">${risicos}</ul>
    ${voorspelling}
    ${geschillen ? `<h3>Geschillen</h3><ul class="geschillen">${geschillen}</ul>` : ''}`
  $('perkament-wrap').hidden = false
  $('perkament-inhoud').scrollTop = 0
  gsap.fromTo('#perkament', { scaleY: 0.04, opacity: 0.6 }, { scaleY: 1, opacity: 1, duration: 1.1, ease: 'power3.out' })
  gsap.fromTo('#perkament-inhoud > *', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4, delay: 0.6 })
}

// ------------------------------------------------------------------ tijdlijn en knoppen

function werkSchuifBij() {
  const n = S.trace?.beurten.length || 0
  const schuif = $('schuif')
  schuif.max = n
  schuif.value = Math.min(S.pos, n)
  $('schuif-label').textContent = `${Math.min(S.pos, n)} / ${n} beurten`
  $('knop-speel').textContent = S.spelen ? '❚❚' : '▶'
}

function koppelKnoppen() {
  $('schuif').addEventListener('input', (e) => {
    S.spelen = false
    S.pos = +e.target.value
    S.verdictGetoond = false
    $('perkament-wrap').hidden = true
    toonTot(S.pos)
    werkSchuifBij()
  })
  $('knop-speel').addEventListener('click', () => {
    S.spelen = !S.spelen
    if (S.spelen && S.trace && S.pos >= S.trace.beurten.length) { S.pos = 0; S.verdictGetoond = false; toonTot(0) } // opnieuw afspelen
    werkSchuifBij()
    if (S.spelen) speler()
  })
  const snelheden = [1, 2, 4]
  $('knop-snelheid').addEventListener('click', () => {
    S.snelheid = snelheden[(snelheden.indexOf(S.snelheid) + 1) % snelheden.length]
    gsap.globalTimeline.timeScale(S.snelheid)
    $('knop-snelheid').textContent = `${S.snelheid}×`
  })
  $('knop-live').addEventListener('click', () => {
    if (!S.trace) return
    S.pos = S.trace.beurten.length
    toonTot(S.pos)
    S.spelen = true
    werkSchuifBij()
    speler()
  })
  $('knop-verdict').addEventListener('click', openPerkament)
  $('sluit-perkament').addEventListener('click', () => ($('perkament-wrap').hidden = true))
  $('perkament-wrap').addEventListener('click', (e) => { if (e.target.id === 'perkament-wrap') $('perkament-wrap').hidden = true })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('perkament-wrap').hidden = true
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('knop-speel').click() }
  })
}

// ------------------------------------------------------------------ data ophalen

async function haal(naam) {
  try {
    const r = await fetch(DATA(naam), { cache: 'no-store' })
    if (r.status === 404) return { ok: true, data: null }
    if (!r.ok) return { ok: false }
    return { ok: true, data: JSON.parse(await r.text()) }
  } catch {
    return { ok: false } // half geschreven bestand of server even weg: vorige toestand houden
  }
}

function nieuweRun(trace) {
  S.runId = trace.run_id
  S.pos = 0
  S.verdictGetoond = false
  S.tegelVoor.clear()
  $('perkament-wrap').hidden = true
  $('leeg').hidden = true
  bouwLeden(trace.raadsleden || [])
  toonTot(0)
}

function werkStatusBij() {
  const t = S.trace
  const chip = $('status-chip')
  if (!t) { chip.textContent = 'wachten'; chip.className = 'chip'; $('status-info').textContent = ''; return }
  const live = t.status === 'bezig'
  chip.textContent = live ? 'live' : t.status === 'klaar' ? 'afgerond' : t.status || 'trace'
  chip.className = `chip ${live ? 'live' : 'klaar'}`
  const v = t.verbruik || {}
  const tokens = Object.values(v).reduce((s, x) => s + (x.invoer || 0) + (x.uitvoer || 0), 0)
  $('status-info').textContent = `${MAP ? `map: ${MAP} · ` : ''}${tokens ? `${tokens.toLocaleString('nl-BE')} tokens · ` : ''}${t.run_id || ''}`
}

async function poll() {
  const [tr, vr] = await Promise.all([haal('trace.json'), haal('verdict.json')])
  if (tr.ok) {
    const trace = tr.data
    if (trace && Array.isArray(trace.beurten)) {
      if (trace.run_id !== S.runId) { S.trace = trace; nieuweRun(trace) }
      else S.trace = trace
    } else if (!trace) {
      S.trace = null; S.runId = null
      $('leeg').hidden = false
    }
  }
  if (vr.ok) S.verdict = vr.data
  werkStatusBij()
  werkSchuifBij()
  if (S.trace && S.spelen) speler()
}

// ------------------------------------------------------------------ start

maakScheuren()
maakMozaiek()
koppelKnoppen()
poll()
setInterval(poll, POLL_MS)
