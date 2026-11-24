// Het Sterrenbeeld van Achrona: speelt trace.json + verdict.json af als een levend sterrenbeeld.
// Leest alleen (via /data/...), schrijft niets terug en roept geen LLM aan. Elk element komt uit de trace.
import gsap from 'gsap'
import { CONFIG, kleurVan, naamVan } from './config.js'
import { haal, idsIn, kernVan, kortZin, BRON } from './data.js'
import { maakHemel } from './hemel.js'

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const T = CONFIG.tempo
const SLOTS = [['ingreep', 'Ingreep'], ['mechanisme', 'Mechanisme'], ['verloop', 'Verloop']]

const h = maakHemel($('scene'))
const WIT = h.kleur(CONFIG.kleuren.ijs), GOUD = h.kleur(CONFIG.kleuren.goud), BLAUW = h.kleur(CONFIG.kleuren.koning)
const BLAUW2 = h.kleur(CONFIG.kleuren.koningLicht), PAARS = h.kleur(CONFIG.kleuren.paars2), ORANJE = h.kleur(CONFIG.kleuren.geschil)
const TEAL = h.kleur(CONFIG.kleuren.herstel)

// ---------------------------------------------------------------- lijnsymbolen (eenheidsvak, y omhoog)
const boog = (r, n = 16, van = 0, tot = Math.PI * 2, cx = 0, cy = 0) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = van + (tot - van) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] })
const GLYPH = {
  archmage: [[[-1, -0.75], [1, -0.75]], [[-0.62, -0.75], [0.12, 1], [0.62, -0.75]], [[-0.38, -0.2], [0.42, -0.2]]],
  engineer: [boog(0.38, 14), boog(0.72, 20), ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return [[0.72 * Math.cos(a), 0.72 * Math.sin(a)], [Math.cos(a), Math.sin(a)]] })],
  guardian_keeper: [[[-0.8, 0.85], [0.8, 0.85], [0.8, 0], [0, -1], [-0.8, 0], [-0.8, 0.85]], [[0, 0.85], [0, -1]], [[-0.8, 0.25], [0.8, 0.25]]],
  historian: [[[-0.7, 0.8], [0.7, 0.8], [0.7, -0.8], [-0.7, -0.8], [-0.7, 0.8]], [[-0.98, 0.8], [0.98, 0.8]], [[-0.98, -0.8], [0.98, -0.8]],
    [[-0.4, 0.35], [0.4, 0.35]], [[-0.4, 0], [0.4, 0]], [[-0.4, -0.35], [0.15, -0.35]]],
  oracle: [boog(1.25, 12, Math.PI * 0.2, Math.PI * 0.8, 0, -0.74), boog(1.25, 12, Math.PI * 1.2, Math.PI * 1.8, 0, 0.74), boog(0.34, 14)],
  beast_master: [[[0, -1], [0, -0.35]], [[0, -0.35], [-0.5, 0.15], [-0.62, 1]], [[-0.5, 0.15], [-1, 0.5]], [[-0.57, 0.6], [-0.95, 0.95]],
    [[0, -0.35], [0.5, 0.15], [0.62, 1]], [[0.5, 0.15], [1, 0.5]], [[0.57, 0.6], [0.95, 0.95]]],
  koning: [[[-0.9, -0.6], [-0.9, 0.5], [-0.45, -0.05], [0, 0.85], [0.45, -0.05], [0.9, 0.5], [0.9, -0.6], [-0.9, -0.6]]],
  _: [[[0, 1], [0.7, 0], [0, -1], [-0.7, 0], [0, 1]]],
}
function glyph(naam, x, y, s, kleur, a) {
  for (const lijn of GLYPH[naam] || GLYPH._) for (let i = 1; i < lijn.length; i++)
    h.lijn(x + lijn[i - 1][0] * s, y + lijn[i - 1][1] * s, x + lijn[i][0] * s, y + lijn[i][1] * s, kleur, a)
}

// ---------------------------------------------------------------- toestand
let trace = null, verdict = null, beurten = [], rollen = [], extras = []
let pos = 0, spelend = true, snel = 1, timer = null, geluid = false, lite = false, gestart = false, vorigeSleutel = ''
let st = leeg()
const goud = new Map() // id -> gouden ster
const deeltjes = []
const fx = { intro: 0, beamT: 1, beamA: 0, gsh: 0, fin: 0, puls: {}, glitch: 1 }
const KONING = { x: 0, y: 0.08 }
const rolKleur = {}

function leeg() { return { goud: new Map(), berichten: 0, rout: null, msg: null, tool: null, besluit: null, vragen: [], weg: [], focus: null, fase: 'debat' } }
const n = () => beurten.length
const totaal = () => n() + extras.length
const isRol = (r) => rollen.includes(r)
const verdictOk = () => !!(verdict && trace && verdict.run_id === trace.run_id && verdict.oorzaak)

function plek(rol) {
  const i = rollen.indexOf(rol), aantal = Math.max(rollen.length, 1)
  if (i < 0) return KONING
  const a = -Math.PI / 2 + (i + 0.5) / aantal * Math.PI * 2
  const rx = Math.max(0.5, Math.min(h.aspect - 0.42, 1.2)), ry = 0.42
  return { x: KONING.x + rx * Math.cos(a), y: KONING.y - ry * Math.sin(a) }
}
const hash = (s, zout = 0) => { let x = 2166136261 ^ zout; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return ((x >>> 0) % 10000) / 10000 }
function goudPlek(id, rol) {
  const p = plek(rol), uit = Math.atan2(p.y - KONING.y, p.x - KONING.x)
  const a = uit + (hash(id) - 0.5) * 3.6, d = 0.13 + hash(id, 7) * 0.17
  return { x: p.x + Math.cos(a) * d * 1.15, y: p.y + Math.sin(a) * d * 0.8 }
}
const centra = () => { const sx = Math.min(1, h.aspect / 1.6); return [{ x: -0.72 * sx, y: 0.42 }, { x: 0, y: 0.7 }, { x: 0.72 * sx, y: 0.42 }] }

/** De toestand na `p` stappen, volledig afgeleid uit de trace. */
function toestand(p) {
  const t = leeg()
  for (let i = 0; i < Math.min(p, n()); i++) {
    const b = beurten[i]
    if (b.soort === 'routering') {
      t.rout = { b, i }; t.msg = null; t.tool = null
      if (Array.isArray(b.open_vragen)) { t.weg = t.vragen.filter((v) => !b.open_vragen.includes(v)); t.vragen = b.open_vragen }
      t.focus = b.aan || null
    } else if (b.soort === 'toolcall' || b.soort === 'bestand') {
      t.tool = { b, i }; t.focus = b.spreker
      if (t.msg && t.msg.b.spreker !== b.spreker) t.msg = null
    } else if (b.soort === 'bericht') {
      if (b.spreker === 'koning') { t.besluit = { b, i }; t.msg = null; t.focus = null; continue }
      t.msg = { b, i }; t.tool = null; t.focus = isRol(b.spreker) ? b.spreker : null
      if (!isRol(b.spreker)) continue
      t.berichten++
      for (const id of idsIn(b.tekst)) {
        const g = t.goud.get(id)
        if (!g) t.goud.set(id, { id, rol: b.spreker, i, links: [] })
        else if (g.rol !== b.spreker && !g.links.includes(b.spreker)) g.links.push(b.spreker)
      }
    }
  }
  if (t.tool && t.tool.i !== Math.min(p, n()) - 1) t.tool = null
  const extra = p > n() ? extras[p - n() - 1] : null
  t.fase = extra === 'f' ? 'finale' : extra === 'g' ? 'geschil' : 'debat'
  return t
}

// ---------------------------------------------------------------- HTML-lagen
const px = (x, y) => [(x / h.aspect * 0.5 + 0.5) * innerWidth, (0.5 - y * 0.5) * innerHeight]
function bouwLabels() {
  const el = $('labels'); el.innerHTML = ''
  rollen.forEach((rol, i) => {
    rolKleur[rol] = h.kleur(kleurVan(rol, i))
    const d = document.createElement('div')
    d.className = 'label rol'; d.dataset.rol = rol; d.style.setProperty('--k', kleurVan(rol, i))
    d.innerHTML = `${esc(naamVan(rol))}<span class="tool"></span>`
    d.onclick = () => { const eigen = beurten.slice(0, Math.min(pos, n())).filter((b) => b.spreker === rol || b.aan === rol); toonPaneel(naamVan(rol), eigen.slice(-6)) }
    el.appendChild(d)
  })
  const k = document.createElement('div'); k.className = 'label rol'; k.dataset.rol = 'koning'; k.style.setProperty('--k', CONFIG.kleuren.koningLicht)
  k.textContent = 'De Koning'
  k.onclick = () => toonPaneel('De Koning', beurten.slice(0, Math.min(pos, n())).filter((b) => b.spreker === 'koning').slice(-6))
  el.appendChild(k)
  SLOTS.forEach(([sleutel, naam], i) => {
    const d = document.createElement('div'); d.className = 'label deel weg'; d.dataset.slot = i
    d.onclick = () => toonPaneel(naam, [verdict?.oorzaak?.[sleutel]])
    el.appendChild(d)
  })
  plaatsLabels()
}
function plaatsLabels() {
  for (const d of document.querySelectorAll('.label.rol')) {
    const p = d.dataset.rol === 'koning' ? KONING : plek(d.dataset.rol)
    const [x, y] = px(p.x, p.y - (d.dataset.rol === 'koning' ? 0.075 : 0.085))
    d.style.left = x + 'px'; d.style.top = y + 'px'
  }
  const c = centra()
  for (const d of document.querySelectorAll('.label.deel')) {
    const [x, y] = px(c[d.dataset.slot].x, c[d.dataset.slot].y + (d.dataset.slot === '1' ? 0.29 : -0.2)) // het middelste label staat boven zijn sterrenbeeld, weg van het sigil
    d.style.left = x + 'px'; d.style.top = y + 'px'
  }
}
addEventListener('resize', () => { plaatsLabels(); for (const g of goud.values()) Object.assign(g, goudPlek(g.id, g.rol)); zetDoelen() })

function toonPaneel(titel, items) {
  $('paneel-titel').textContent = titel
  $('paneel-inhoud').innerHTML = (items || []).filter((x) => x != null).map((x) => `<pre>${esc(JSON.stringify(x, null, 2))}</pre>`).join('')
    || '<p>Nog niets in de trace.</p>'
  $('paneel').hidden = false
}
$('paneel-sluit').onclick = () => { $('paneel').hidden = true }

function tekenHtml() {
  const fin = st.fase === 'finale', gsh = st.fase === 'geschil'
  // labels
  for (const d of document.querySelectorAll('.label.rol')) {
    const rol = d.dataset.rol
    d.classList.toggle('weg', fin)
    d.classList.toggle('dim', !fin && !!st.focus && rol !== st.focus && rol !== 'koning')
    const tool = d.querySelector('.tool')
    if (tool) {
      const aan = st.tool && st.tool.b.spreker === rol
      tool.classList.toggle('aan', !!aan)
      if (aan) tool.textContent = st.tool.b.soort === 'bestand' ? '▤ bron in prompt' : `${{ zoek: '⌕', zoek_betekenis: '✧', toon: '◉', lees_kennisbron: '▤' }[st.tool.b.tool] || '⌕'} ${st.tool.b.tool}`
    }
  }
  // de keuze van de Koning
  const bevel = $('bevel'), r = st.rout
  bevel.classList.remove('stop')
  if (fin || gsh) bevel.hidden = true
  else if (st.besluit) {
    bevel.hidden = false
    $('bevel-kop').innerHTML = 'De Koning besluit'
    $('bevel-reden').textContent = kortZin(st.besluit.b.tekst, 34)
    bevel.onclick = () => toonPaneel('De Koning besluit', [st.besluit.b])
  } else if (r && r.b.aan == null) {
    bevel.hidden = false; bevel.classList.add('stop')
    $('bevel-kop').innerHTML = 'Het debat is voorbij'
    $('bevel-reden').textContent = kortZin(r.b.reden)
    bevel.onclick = () => toonPaneel('Routering: de Koning stopt', [r.b])
  } else if (r) {
    bevel.hidden = false
    const wie = r.b.spreker === 'koning' ? 'De Koning' : naamVan(r.b.spreker)
    bevel.style.setProperty('--k2', kleurVan(r.b.aan, rollen.indexOf(r.b.aan)))
    $('bevel-kop').innerHTML = `${esc(wie)} kiest <b>${esc(naamVan(r.b.aan))}</b>`
    $('bevel-reden').textContent = kortZin(r.b.reden)
    bevel.onclick = () => toonPaneel(`Routering #${r.b.nr ?? r.i + 1}`, [r.b])
  } else bevel.hidden = true
  // de inbreng van de spreker
  const kern = $('kern')
  if (gsh) {
    const gs = trace.geschillen || [], opgelost = gs.filter((g) => g.uitkomst).length
    kern.hidden = false; kern.style.setProperty('--k', CONFIG.kleuren.geschil)
    $('kern-kop').textContent = `${gs.length} geschil${gs.length === 1 ? '' : 'len'} · ${opgelost} beslecht (goud) · ${gs.length - opgelost} open (flikkert)`
    $('kern-tekst').innerHTML = gs.slice(0, 4).map((g) => `${g.uitkomst ? '✦' : '⚡'} ${esc(kortZin(g.onderwerp, 12))}`).join('<br>') + (gs.length > 4 ? `<br>+ ${gs.length - 4} meer` : '')
    $('kern-ids').innerHTML = ''
    kern.onclick = () => toonPaneel('Geschillen', gs)
  } else if (!fin && st.msg) {
    const b = st.msg.b, ids = idsIn(b.tekst), max = CONFIG.tekst.idChips
    kern.hidden = false; kern.style.setProperty('--k', b.spreker === 'mens' ? CONFIG.kleuren.geschil : kleurVan(b.spreker, rollen.indexOf(b.spreker)))
    $('kern-kop').textContent = naamVan(b.spreker)
    $('kern-tekst').textContent = kernVan(b.tekst)
    $('kern-ids').innerHTML = ids.slice(0, max).map((i) => `<span class="chip">${esc(i)}</span>`).join('') + (ids.length > max ? `<span class="chip meer">+${ids.length - max}</span>` : '')
    kern.onclick = () => toonPaneel(`Bericht #${b.nr ?? st.msg.i + 1} · ${naamVan(b.spreker)}`, [b])
  } else kern.hidden = true
  // open vragen
  const blok = $('vragen-blok'), max = CONFIG.tekst.openVragen
  blok.hidden = fin || !(st.vragen.length || st.weg.length)
  $('vragen').innerHTML = st.weg.slice(0, 2).map((v) => `<li class="weg">${esc(kortZin(v, 14))}</li>`).join('')
    + st.vragen.slice(0, max).map((v) => `<li>${esc(kortZin(v, 14))}</li>`).join('')
    + (st.vragen.length > max ? `<li class="meer">+ ${st.vragen.length - max} meer</li>` : '')
  blok.onclick = () => toonPaneel('Open vragen van de Koning', [st.rout?.b])
  // budget
  $('budget').innerHTML = Array.from({ length: CONFIG.budget }, (_, i) => `<i class="${i >= CONFIG.budget - st.berichten ? 'uit' : ''}"></i>`).join('')
  $('budget').onclick = () => toonPaneel(`Beurtenbudget: ${st.berichten} van ${CONFIG.budget} gebruikt`, [{ raadslid_beurten: st.berichten, budget: CONFIG.budget, verbruik: trace?.verbruik }])
  // finale
  $('titel').classList.toggle('weg', fin)
  for (const d of document.querySelectorAll('.label.deel')) d.classList.toggle('weg', !fin)
  $('vonnis').hidden = !fin
  $('status').textContent = trace?.status === 'bezig' ? '● live' : BRON ? `voorbeeld: ${BRON}` : ''
  $('k-stap').textContent = `${pos}/${totaal()}`
  $('k-speel').textContent = spelend ? '❚❚' : '▶'
}

function bouwVonnis() {
  const el = $('vonnis')
  if (!verdictOk()) { el.innerHTML = ''; return }
  const o = verdict.oorzaak, W = CONFIG.tekst
  const deel = ([k, naam]) => o[k]?.bewering
    ? `<h3>${naam}</h3><p data-k="${k}">${esc(kortZin(o[k].bewering, W.vonnisWoorden))}</p>`
    : `<h3>${naam}</h3><p data-k="${k}" class="leeg-deel">Onbekend: geen bewijs in het debat.</p>`
  const v = verdict.voorspelling, vb = trace.verbruik || {}
  const tokens = Object.entries(vb).map(([m, x]) => `${m}: ${(x.invoer || 0).toLocaleString('nl-BE')} in · ${(x.uitvoer || 0).toLocaleString('nl-BE')} uit`).join(' — ')
  el.innerHTML = `<div><h2>Het Vonnis</h2>${SLOTS.map(deel).join('')}</div>`
    + `<div><h3>Herstelplan</h3><ol>${(verdict.acties || []).map((a, i) => `<li data-a="${i}">${esc(kortZin(a.actie, W.actieWoorden))}</li>`).join('')}</ol></div>`
    + `<div><h3>Risico's</h3>${(verdict.risicos || []).map((r, i) => `<p class="risico" data-r="${i}">${esc(kortZin(r.risico, W.actieWoorden))}</p>`).join('')}`
    + (v ? `<h3>Voorspelling</h3><p data-v="1"><span class="dag">dag ${esc(v.dag)}</span><br>${esc(kortZin(v.bewering, W.actieWoorden))}</p>` : '') + '</div>'
    + `<p class="voet">${esc(trace.run_id || '')}${tokens ? ' · tokens ' + esc(tokens) : ''}</p>`
  el.onclick = (e) => {
    const d = e.target.closest('[data-k],[data-a],[data-r],[data-v]')?.dataset
    if (!d) return toonPaneel('Council Verdict', [verdict])
    if (d.k) toonPaneel(`Oorzaak: ${d.k}`, [o[d.k]])
    else if (d.a) toonPaneel(`Actie ${+d.a + 1}`, [verdict.acties[d.a]])
    else if (d.r) toonPaneel('Risico', [verdict.risicos[d.r]])
    else toonPaneel('Voorspelling', [v])
  }
  SLOTS.forEach(([k, naam], i) => {
    const d = document.querySelector(`.label.deel[data-slot="${i}"]`); if (!d) return
    const s = o[k] || {}
    d.classList.toggle('leeg', !s.bewering)
    d.innerHTML = esc(naam) + (s.bewering
      ? (typeof s.zekerheid === 'number' ? `<span class="balk"><i style="width:${Math.round(s.zekerheid * 100)}%"></i></span>` : '') + `<small>${(s.bewijs || []).length} bewijsstukken</small>`
      : '<small>onbekend</small>')
  })
}

// ---------------------------------------------------------------- stappen
/** Waar elke bewijsster in de finale heen vliegt: het sterrenbeeld van het deel waarvoor ze bewijs is. */
let beelden = []
function zetDoelen() {
  beelden = []
  for (const g of goud.values()) g.doel = null
  if (!verdictOk()) return
  const c = centra()
  SLOTS.forEach(([k], s) => {
    const slot = verdict.oorzaak[k] || {}, ids = slot.bewering ? (slot.bewijs || []) : []
    const punten = ids.map((id, j) => {
      const a = Math.PI / 2 + j / Math.max(ids.length, 1) * Math.PI * 2 + s * 0.5
      const r = ids.length === 1 ? 0 : 0.1 + 0.035 * (j % 2)
      const p = { id, x: c[s].x + Math.cos(a) * r * 1.1, y: c[s].y + Math.sin(a) * r }
      const g = goud.get(id)
      if (g && !g.doel) { g.doel = p; p.echt = true }
      return p
    })
    beelden.push({ c: c[s], punten, leeg: !slot.bewering, z: typeof slot.zekerheid === 'number' ? slot.zekerheid : 0.7 })
  })
}

function zet(nieuw, animeer) {
  const oud = pos
  pos = Math.max(0, Math.min(nieuw, totaal()))
  st = toestand(pos)
  // gouden sterren bijwerken
  for (const id of [...goud.keys()]) if (!st.goud.has(id)) { gsap.killTweensOf(goud.get(id)); goud.delete(id) }
  let nieuwe = 0
  for (const [id, g] of st.goud) {
    let o = goud.get(id)
    if (!o) {
      o = { id, rol: g.rol, ...goudPlek(id, g.rol), s: 1, fase: hash(id, 3), links: [] }
      goud.set(id, o)
      if (animeer) { o.s = 0; gsap.to(o, { s: 1, duration: 0.9 / snel, delay: Math.min(nieuwe++ * 0.09, 1.2) / snel, ease: 'back.out(2.5)' }) }
    }
    o.links = g.links
  }
  zetDoelen()
  const stap = pos === oud + 1 && animeer ? (pos <= n() ? beurten[pos - 1] : { soort: extras[pos - n() - 1] }) : null
  gsap.killTweensOf(fx, 'beamT,beamA,gsh,fin')
  const routActief = st.fase === 'debat' && st.rout && st.rout.b.aan != null
  if (stap?.soort === 'routering' && routActief) { fx.beamT = 0; fx.beamA = 1; gsap.to(fx, { beamT: 1, duration: 0.9 / snel, ease: 'power2.out' }); gsap.to(fx, { beamA: 0.5, duration: 1.5 / snel, delay: 1 / snel }); piep(330) }
  else { fx.beamT = 1; fx.beamA = routActief ? 0.5 : 0 }
  if (stap && (stap.soort === 'toolcall' || stap.soort === 'bestand')) {
    const rol = stap.spreker, p = plek(rol)
    fx.puls[rol] = 1; gsap.fromTo(fx.puls, { [rol]: 1.7 }, { [rol]: 1, duration: 0.7 / snel, ease: 'power2.out' })
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = 0.2 + Math.random() * 0.25
      const dl = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, tx: p.x, ty: p.y, t: 0, rol }
      deeltjes.push(dl)
      gsap.to(dl, { t: 1, duration: (0.5 + Math.random() * 0.4) / snel, ease: 'power2.in', onComplete: () => deeltjes.splice(deeltjes.indexOf(dl), 1) })
    }
    piep(520, 0.04)
  }
  if (stap?.soort === 'bericht') piep(660, 0.05)
  const gDoel = st.fase === 'debat' ? 0 : 1, fDoel = st.fase === 'finale' ? 1 : 0
  if (animeer) { gsap.to(fx, { gsh: gDoel, duration: 1.2 / snel }); gsap.to(fx, { fin: fDoel, duration: (fDoel ? 3.2 : 0.6) / snel, ease: 'power2.inOut' }); if (stap?.soort === 'f') piep(220, 0.4) }
  else { fx.gsh = gDoel; fx.fin = fDoel }
  tekenHtml()
}

function duur(stap) { // stap = index van de zojuist getoonde stap
  if (stap >= n()) return extras[stap - n()] === 'g' ? T.geschillen : T.finale
  const b = beurten[stap]
  if (b.soort === 'routering') return b.aan == null ? T.stop : T.routering
  if (b.soort === 'toolcall' || b.soort === 'bestand') return T.toolcall
  const woorden = kernVan(b.tekst).split(/\s+/).length
  return Math.min(T.berichtMax, Math.max(T.berichtMin, 1.2 + woorden * T.berichtPerWoord))
}
function tik() {
  clearTimeout(timer)
  if (!spelend) return
  if (pos < totaal()) { zet(pos + 1, true); timer = setTimeout(tik, duur(pos - 1) * 1000 / snel) }
  else timer = setTimeout(tik, 400) // live: wachten op een nieuwe beurt
}
function speel(aan) { spelend = aan; tekenHtml(); if (aan) tik(); else clearTimeout(timer) }

// ---------------------------------------------------------------- geluid (standaard uit)
let audio = null
function piep(freq, vol = 0.05) {
  if (!geluid) return
  try {
    audio ||= new AudioContext()
    const o = audio.createOscillator(), g = audio.createGain()
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5)
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.5)
  } catch { /* geen geluid beschikbaar */ }
}

// ---------------------------------------------------------------- bediening
$('k-speel').onclick = () => speel(!spelend)
$('k-live').onclick = () => { zet(totaal(), false); speel(true) }
$('k-snel').onclick = () => { snel = snel === 1 ? 2 : snel === 2 ? 0.5 : 1; $('k-snel').textContent = snel + '×' }
$('k-geluid').onclick = () => { geluid = !geluid; $('k-geluid').textContent = geluid ? '🔊' : '🔇'; $('k-geluid').classList.toggle('aan', geluid) }
$('k-lite').onclick = () => { lite = !lite; document.body.classList.toggle('lite', lite); $('k-lite').classList.toggle('aan', lite); h.setLite(lite) }
addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); speel(!spelend) }
  else if (e.code === 'ArrowRight') { speel(false); zet(pos + 1, true) }
  else if (e.code === 'ArrowLeft') { speel(false); zet(pos - 1, false) }
  else if (e.code === 'Escape') $('paneel').hidden = true
})
h.canvas.addEventListener('click', (e) => { // klik op een gouden ster: alle beurten die dat ID noemen
  const x = (e.clientX / innerWidth * 2 - 1) * h.aspect, y = 1 - e.clientY / innerHeight * 2
  let beste = null, afstand = 0.045
  for (const g of goud.values()) {
    const p = sterPlek(g), d = Math.hypot(p.x - x, p.y - y)
    if (d < afstand) { afstand = d; beste = g }
  }
  if (beste) toonPaneel(`Bewijs ${beste.id}`, beurten.slice(0, Math.min(pos, n())).filter((b) => b.soort === 'bericht' && idsIn(b.tekst).includes(beste.id)))
})

// ---------------------------------------------------------------- tekenen
const mix = (a, b, t) => a + (b - a) * t
const zacht = (t) => t * t * (3 - 2 * t)
function sterPlek(g) { const f = g.doel ? zacht(fx.fin) : 0; return g.doel ? { x: mix(g.x, g.doel.x, f), y: mix(g.y, g.doel.y, f) } : g }
function schok(a, b, kleur, alpha, sterkte, bocht) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, N = 14
  let vx = a.x, vy = a.y
  for (let i = 1; i <= N; i++) {
    const t = i / N, buig = Math.sin(t * Math.PI) * bocht, r = i === N ? 0 : (Math.random() - 0.5) * sterkte
    const x = a.x + dx * t + nx * (buig + r), y = a.y + dy * t + ny * (buig + r)
    h.lijn(vx, vy, x, y, kleur, alpha); vx = x; vy = y
  }
}

function frame(ms) {
  requestAnimationFrame(frame)
  if (document.hidden) return
  const t = ms / 1000
  h.begin()
  if (trace) {
    const fin = fx.fin, dim = 1 - 0.86 * zacht(fin)
    // Raadsleden
    rollen.forEach((rol, i) => {
      const p = plek(rol), k = rolKleur[rol] || WIT
      const op = Math.max(0, Math.min(1, fx.intro * (rollen.length + 2) - i))
      const a = op * dim * (st.focus && st.focus !== rol ? 0.3 : 1), puls = fx.puls[rol] || 1
      const actief = st.focus === rol ? 1 + 0.08 * Math.sin(t * 3) : 1
      h.punt(p.x, p.y, 120 * puls * actief, k, a * 0.5, i * 0.17)
      h.punt(p.x, p.y, 13, WIT, a, i * 0.31)
      glyph(rol, p.x, p.y, 0.058 * puls, k, a)
    })
    // de Koning: blauwe poolster met kroon
    const gestopt = st.rout && st.rout.b.aan == null
    const ka = Math.min(1, fx.intro * 2) * dim * (gestopt ? 0.4 : 1)
    h.punt(KONING.x, KONING.y, 170, BLAUW, ka * 0.75, 0.5)
    h.punt(KONING.x, KONING.y, 46, BLAUW2, ka, 0.2)
    h.punt(KONING.x, KONING.y, 14, WIT, ka, 0.7)
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, r = 0.1; h.lijn(KONING.x, KONING.y, KONING.x + Math.cos(a) * r * 0.5, KONING.y + Math.sin(a) * r * 0.5, BLAUW2, ka * 0.35) }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, r = 0.11; h.lijn(KONING.x, KONING.y, KONING.x + Math.cos(a) * r, KONING.y + Math.sin(a) * r, BLAUW2, ka * 0.55) }
    glyph('koning', KONING.x, KONING.y + 0.15, 0.036, BLAUW2, ka)
    // routering: lichtstraal van de poolster naar de gekozen ster
    if (st.fase === 'debat' && st.rout && st.rout.b.aan && fx.beamA > 0) {
      const p = plek(st.rout.b.aan), bx = mix(KONING.x, p.x, fx.beamT), by = mix(KONING.y, p.y, fx.beamT)
      h.lijn(KONING.x, KONING.y, bx, by, BLAUW2, fx.beamA)
      h.lijn(KONING.x, KONING.y + 0.004, bx, by + 0.004, BLAUW, fx.beamA)
      if (fx.beamT < 1) h.punt(bx, by, 60, BLAUW2, 1)
    }
    // bewijs: gouden sterren en verbindingslijnen
    for (const g of goud.values()) {
      const p = sterPlek(g), eigen = plek(g.rol)
      const a = g.s * (g.doel ? 1 : 1 - 0.8 * zacht(fin)) * (st.focus && st.focus !== g.rol && fin < 0.01 ? 0.55 : 1)
      const sx = mix(eigen.x, p.x, Math.min(1, g.s)), sy = mix(eigen.y, p.y, Math.min(1, g.s))
      h.punt(sx, sy, 34 * Math.min(1.3, g.s), GOUD, a, g.fase)
      h.punt(sx, sy, 8, WIT, a * 0.9, g.fase)
      h.lijn(eigen.x, eigen.y, sx, sy, GOUD, a * 0.14 * (1 - fin))
      for (const rol of g.links) { const q = plek(rol); h.lijn(sx, sy, q.x, q.y, GOUD, a * 0.6 * (1 - fin)) }
    }
    // toolcall: deeltjes stromen naar de ster
    for (const d of deeltjes) h.punt(mix(d.x, d.tx, d.t), mix(d.y, d.ty, d.t), 9, rolKleur[d.rol] || WIT, 0.9 * (1 - d.t * 0.5))
    // geschillen: trillende flitslijnen; beslecht = goud en stil
    if (fx.gsh > 0.01 && fin < 0.99) {
      const gs = trace.geschillen || []
      gs.forEach((g, gi) => {
        const wie = Object.keys(g.standpunten || {}).filter(isRol)
        const paren = wie.length > 1 ? wie.slice(1).map((r, i) => [plek(wie[i]), plek(r)]) : wie.length ? [[plek(wie[0]), KONING]] : []
        const bocht = (gi - (gs.length - 1) / 2) * 0.045, a = fx.gsh * (1 - fin)
        for (const [p, q] of paren) {
          if (g.uitkomst) schok(p, q, GOUD, a * 0.75, 0, bocht)
          else if (Math.random() > 0.12) schok(p, q, ORANJE, a * (0.45 + Math.random() * 0.55), 0.03, bocht)
        }
      })
    }
    // finale: drie sterrenbeelden die samen het sigil vormen
    if (fin > 0.01) {
      const f = zacht(fin), c = centra(), mid = { x: 0, y: (c[0].y + c[1].y + c[2].y) / 3 }
      for (let i = 0; i < 3; i++) {
        const a = c[i], b = c[(i + 1) % 3]
        h.lijn(a.x, a.y, b.x, b.y, GOUD, f * 0.3); h.lijn(a.x, a.y, mid.x, mid.y, TEAL, f * 0.28)
      }
      for (let i = 0; i < 40; i++) { const a1 = i / 40 * Math.PI * 2, a2 = (i + 1) / 40 * Math.PI * 2, r = 0.06 + 0.008 * Math.sin(t * 2); h.lijn(mid.x + Math.cos(a1) * r, mid.y + Math.sin(a1) * r, mid.x + Math.cos(a2) * r, mid.y + Math.sin(a2) * r, TEAL, f * 0.6) }
      h.punt(mid.x, mid.y, 60, TEAL, f * 0.8, 0.4)
      for (const beeld of beelden) {
        if (beeld.leeg) { // eerlijk onbekend: een donkere, flikkerende vlek
          const fl = Math.random() > 0.25 ? 0.25 + Math.random() * 0.45 : 0.05
          h.punt(beeld.c.x, beeld.c.y, 150, PAARS, f * fl, 0.9)
          schok({ x: beeld.c.x - 0.09, y: beeld.c.y }, { x: beeld.c.x + 0.09, y: beeld.c.y }, PAARS, f * fl, 0.05, 0)
          continue
        }
        const helder = 0.3 + 0.7 * beeld.z, P = beeld.punten
        h.punt(beeld.c.x, beeld.c.y, 200, GOUD, f * 0.16 * helder, 0.6)
        P.forEach((p, j) => {
          if (!p.echt) { h.punt(p.x, p.y, 30, GOUD, f * helder, hash(p.id, 3)); h.punt(p.x, p.y, 8, WIT, f * helder) }
          if (P.length > 1 && (P.length > 2 || j === 0)) { const q = P[(j + 1) % P.length]; h.lijn(p.x, p.y, q.x, q.y, GOUD, f * helder * 0.85) }
          if (P.length > 4 && j % 2 === 0) { const q = P[(j + 2) % P.length]; h.lijn(p.x, p.y, q.x, q.y, GOUD, f * helder * 0.3) }
        })
      }
    }
  }
  // de Desync trekt weg naarmate er bewijs komt, en verdwijnt bij het vonnis
  const doel = st.fase === 'finale' ? 0 : Math.max(0.22, 1 - goud.size / 36)
  fx.glitch += (doel - fx.glitch) * 0.03
  h.render(t, fx.glitch * (lite ? 0.5 : 1), fx.fin)
}
requestAnimationFrame(frame)

// ---------------------------------------------------------------- data ophalen (alleen lezen)
async function poll() {
  try {
    const [rt, rv] = await Promise.all([haal('trace.json'), haal('verdict.json')])
    if (rt.ok) {
      const nt = rt.data && Array.isArray(rt.data.beurten) ? rt.data : null
      const nv = rv.ok ? rv.data : verdict
      const sleutel = nt ? `${nt.run_id}|${nt.status}|${nt.beurten.length}|${(nt.geschillen || []).length}|${nv?.run_id}|${JSON.stringify(nv || 0).length}` : ''
      if (sleutel !== vorigeSleutel) { vorigeSleutel = sleutel; laad(nt, nv) }
    }
  } catch { /* volgende ronde opnieuw */ }
  setTimeout(poll, CONFIG.pollMs)
}
function laad(nt, nv) {
  const nieuweRun = !trace || !nt || nt.run_id !== trace.run_id
  const zelfdeRollen = nt && rollen.join() === (nt.raadsleden || []).join()
  trace = nt; verdict = nv
  $('leeg').hidden = !!trace
  if (!trace) { beurten = []; rollen = []; extras = []; goud.clear(); st = leeg(); pos = 0; $('labels').innerHTML = ''; tekenHtml(); return }
  beurten = trace.beurten; rollen = Array.isArray(trace.raadsleden) ? trace.raadsleden : []
  const klaar = trace.status !== 'bezig'
  extras = klaar ? [...((trace.geschillen || []).length ? ['g'] : []), ...(verdictOk() ? ['f'] : [])] : []
  if (!zelfdeRollen || nieuweRun) bouwLabels()
  bouwVonnis()
  if (nieuweRun) {
    goud.clear(); fx.intro = 0; fx.fin = 0; fx.gsh = 0; fx.glitch = 1
    zet(klaar ? 0 : n(), false) // een lopende run volg je live; een afgeronde run speelt vanaf het begin
    $('titel').classList.add('groot')
    gsap.to(fx, { intro: 1, duration: T.opening, ease: 'power1.out' })
    setTimeout(() => $('titel').classList.remove('groot'), T.opening * 600)
    clearTimeout(timer); if (spelend) timer = setTimeout(tik, T.opening * 1000)
  } else zet(Math.min(pos, totaal()), false)
  gestart = true
}
$('titel').classList.add('groot')
tekenHtml()
poll()
