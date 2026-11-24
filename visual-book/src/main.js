// Het Kroniekboek van Achrona: speelt trace.json en verdict.json af als een pop-upboek dat zichzelf herstelt.
// Leest alleen; schrijft niets, roept geen LLM aan. Elk element komt uit de trace en is klikbaar naar de ruwe beurt.
import { gsap } from 'gsap'
import './style.css'
import { CONFIG, kleurVan, naamVan } from './config.js'
import { haal, BRON, DEBUG, idsIn, kernVan, kortZin, laatsteDag } from './data.js'
import { maakWereld } from './scene.js'
import { geluid } from './audio.js'

const $ = (id) => document.getElementById(id)
const wacht = (s) => new Promise((r) => gsap.delayedCall(s, r)) // volgt de afspeelsnelheid
// Een animatie die wordt afgebroken (terugspoelen, Live), mag de speler nooit laten hangen.
let afbreek = null, afbreekNu = () => {}
const nieuwAfbreek = () => { afbreekNu(); afbreek = new Promise((r) => (afbreekNu = r)) }
nieuwAfbreek()
const tot = (p) => Promise.race([p, afbreek])
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const TOOL_ICOON = { lees_kennisbron: '📖', zoek: '🔍', zoek_betekenis: '🧭', toon: '📜' }

const S = {
  trace: null, verdict: null, runId: null, leden: [],
  pos: 0, spelen: true, snelheid: 1, bezig: false, opnieuw: false, gen: 0,
  w: null, ids: [], vragen: [], finaleGedaan: false, geopend: false,
}

// ------------------------------------------------------------------ hulpjes

const isLid = (rol) => S.leden.includes(rol)
const klaar = () => !!S.trace && (S.trace.status ?? 'klaar') === 'klaar' && !!S.verdict && S.verdict.run_id === S.trace.run_id
const lidBerichten = (tot) => S.trace.beurten.slice(0, tot).filter((b) => b.soort === 'bericht' && isLid(b.spreker))

function toonPaneel(titel, beurten, kleur) {
  $('paneel-titel').textContent = titel
  $('paneel').style.setProperty('--kleur', kleur || '#3b2f55')
  $('paneel-inhoud').innerHTML = [].concat(beurten).filter(Boolean).map((b) => `<pre>${esc(JSON.stringify(b, null, 2))}</pre>`).join('')
  $('paneel').hidden = false
}

// ------------------------------------------------------------------ HTML-overlays

function zetBevel(b, direct) {
  if (!b) return ($('bevel').hidden = true)
  $('bevel').hidden = false
  $('bevel').onclick = () => toonPaneel(`Routering #${b.nr}`, b, '#1D4ED8')
  $('bevel-aan').textContent = b.aan ? `De Koning → ${naamVan(b.aan)}` : 'De Koning staat op: het debat is voorbij'
  const zin = kortZin(b.reden)
  const el = $('bevel-reden')
  if (direct) { el.textContent = zin; return }
  el.textContent = ''
  const o = { n: 0 }
  geluid.veer()
  gsap.to(o, { n: zin.length, duration: Math.min(1.8, zin.length / 45), ease: 'none', onUpdate: () => (el.textContent = zin.slice(0, Math.round(o.n))) })
}

function zetVragen(b, direct) {
  const nieuw = (b?.open_vragen || []).slice(0, CONFIG.tekst.openVragen)
  const ul = $('vragen')
  const weg = direct ? [] : S.vragen.filter((v) => !(b?.open_vragen || []).includes(v)).slice(0, 2)
  ul.innerHTML = ''
  for (const v of weg) ul.append(Object.assign(document.createElement('li'), { className: 'weg', textContent: v }))
  for (const v of nieuw) {
    const li = Object.assign(document.createElement('li'), { textContent: v })
    li.onclick = () => toonPaneel(`Open vragen (routering #${b.nr})`, b, '#1D4ED8')
    ul.append(li)
  }
  S.vragen = b?.open_vragen || []
  if (!direct) {
    gsap.to(ul.querySelectorAll('.weg'), { opacity: 0, height: 0, margin: 0, duration: 0.8, delay: 1.6, onComplete() { this.targets().forEach((e) => e.remove()) } })
    gsap.from(ul.querySelectorAll('li:not(.weg)'), { opacity: 0, x: -12, filter: 'blur(3px)', stagger: 0.12, duration: 0.6 })
  }
}

function zetBallon(b, tools, direct) {
  const ballon = $('ballon')
  if (!b) { ballon.hidden = true; return Promise.resolve() }
  const kleur = b.spreker === 'koning' ? '#1D4ED8' : kleurVan(b.spreker, S.leden.indexOf(b.spreker))
  ballon.hidden = false
  ballon.style.setProperty('--kleur', kleur)
  ballon.onclick = () => toonPaneel(`${naamVan(b.spreker)}: beurt #${b.nr}`, [...tools, b], kleur)
  $('ballon-naam').textContent = naamVan(b.spreker)
  $('ballon-tools').textContent = tools.map((t) => (t.soort === 'bestand' ? '📄' : TOOL_ICOON[t.tool] || '⚙')).join('')
  const kern = kernVan(b.tekst)
  const p = $('ballon-kern')
  p.innerHTML = kern.split(/(\s+)/).map((d) => (/^\s+$/.test(d) ? d : `<span class="w${idsIn(d).length ? ' id' : ''}">${esc(d)}</span>`)).join('')
  $('ballon-ids').innerHTML = idsIn(b.tekst).map((id) => `<span>${esc(id)}</span>`).join('')
  const woorden = p.querySelectorAll('.w')
  if (direct) { gsap.set(woorden, { opacity: 1 }); return Promise.resolve() }
  gsap.from('#ballon-ids span', { opacity: 0, y: 6, stagger: 0.05, delay: woorden.length / CONFIG.tempo.woordenPerSeconde })
  return gsap.to(woorden, { opacity: 1, duration: 0.2, stagger: 1 / CONFIG.tempo.woordenPerSeconde }).then()
}

function toolsVoor(index) { // de toolcalls van dezelfde spreker vlak voor een bericht
  const uit = []
  for (let i = index - 1; i >= 0; i--) {
    const b = S.trace.beurten[i]
    if ((b.soort === 'toolcall' || b.soort === 'bestand') && b.spreker === S.trace.beurten[index].spreker) uit.unshift(b)
    else if (b.soort === 'routering') break
  }
  return uit
}

function zetStatus() {
  const t = S.trace
  if (!t) { $('status').textContent = ''; return }
  const live = t.status === 'bezig'
  $('status').innerHTML = `${BRON ? `bron: ${esc(BRON)} · ` : ''}<span class="${live ? 'live' : ''}">${live ? 'live' : 'afgerond'}</span> · ${S.pos}/${t.beurten.length}`
}

// ------------------------------------------------------------------ één beurt afspelen

async function speel(b, index) {
  const w = S.w
  if (b.soort === 'routering') {
    zetVragen(b, false)
    if (b.aan && isLid(b.aan)) {
      w.koningGloed(true)
      zetBevel(b, false)
      $('ballon').hidden = true
      geluid.pagina()
      w.paginaOm()
      w.zetSpreker(b.aan)
      await wacht(0.7)
      await tot(w.draadNaar(b.aan)?.then() ?? Promise.resolve())
      await wacht(Math.max(0.3, CONFIG.tempo.routering - 1.7))
      w.koningGloed(false)
    } else if (!b.aan) {
      zetBevel(b, false)
      w.draadNaar(null)
      w.zetSpreker(null)
      w.koningStaatOp()
      await wacht(CONFIG.tempo.routering)
    }
  } else if (b.soort === 'toolcall' || b.soort === 'bestand') {
    const f = w.figuren[b.spreker]
    if (f) gsap.fromTo(f.mat, { emissiveIntensity: 0.35 }, { emissiveIntensity: 0.05, duration: 0.5 })
    geluid.pagina()
    await wacht(CONFIG.tempo.toolcall)
  } else if (b.soort === 'bericht') {
    const tools = toolsVoor(index)
    if (isLid(b.spreker)) {
      const n = lidBerichten(index + 1).length // dit is het n-de Raadslid-bericht: kaars n dooft
      w.kaarsUit(CONFIG.kaarsen - n)
      geluid.sis()
    }
    const tekst = zetBallon(b, tools, false)
    const nieuw = idsIn(b.tekst).filter((id) => !S.ids.includes(id))
    const vluchten = nieuw.map((id, i) => {
      const seg = S.ids.length
      S.ids.push(id)
      return w.snipperNaar(id, isLid(b.spreker) ? b.spreker : 'koning', seg, 0.4 + i * 0.22).then(() => geluid.kling())
    })
    await tot(Promise.all([tekst, ...vluchten]))
    await wacht(CONFIG.tempo.naBericht)
  }
}

// ------------------------------------------------------------------ alles tot positie `tot` meteen tonen

function toonTot(tot) {
  S.gen++
  nieuwAfbreek()
  const w = S.w
  gsap.killTweensOf(['.w', '#ballon-ids span', '#vragen li'])
  w.herstelAlles()
  $('vonnis').hidden = true
  $('k-vonnis').disabled = true
  S.ids = []
  const beurten = S.trace.beurten.slice(0, tot)
  let routering = null, bericht = null, berichtIndex = -1
  beurten.forEach((b, i) => {
    if (b.soort === 'routering') routering = b
    if (b.soort === 'bericht') { bericht = b; berichtIndex = i; for (const id of idsIn(b.tekst)) if (!S.ids.includes(id)) S.ids.push(id) }
  })
  S.ids.forEach((_, i) => w.lasSegment(i, true))
  const uit = lidBerichten(tot).length
  w.kaarsen.forEach((k, i) => (i < CONFIG.kaarsen - uit ? w.kaarsAan(i, true) : w.kaarsUit(i, true)))
  w.koningRecht(true)
  w.koningGloed(false, true)
  const spreker = routering?.aan && isLid(routering.aan) ? routering.aan : null
  w.zetSpreker(spreker, true)
  w.draadNaar(spreker, true)
  if (routering && !routering.aan) w.koningStaatOp(true)
  zetBevel(routering, true)
  S.vragen = []
  zetVragen(routering, true)
  zetBallon(bericht, bericht ? toolsVoor(berichtIndex) : [], true)
  if (tot >= S.trace.beurten.length && klaar()) finaleStil()
  zetStatus()
}

// ------------------------------------------------------------------ finale: het vonnis

const SLOTS = [['ingreep', 'Ingreep'], ['mechanisme', 'Mechanisme'], ['verloop', 'Verloop']]

function healHerstel(direct) { // eerlijk: elk deel zonder bewering houdt een derde van de scheur open
  const w = S.w
  const nulls = SLOTS.filter(([k]) => !S.verdict.oorzaak?.[k]?.bewering).length
  const open = Math.round((nulls / 3) * w.segmenten.length)
  w.segmenten.forEach((seg, i) => { if (i < w.segmenten.length - open) w.lasSegment(i, direct) })
  SLOTS.forEach(([k], i) => w.tabVul(i, !!S.verdict.oorzaak?.[k]?.bewering, S.verdict.oorzaak?.[k]?.zekerheid ?? 1))
}

function finaleStil() {
  S.finaleGedaan = true
  healHerstel(true)
  S.w.schaduwAchrona(true)
  $('k-vonnis').disabled = false
}

async function finale() {
  S.finaleGedaan = true
  const w = S.w, gen = S.gen
  const door = () => gen === S.gen // gestopt door terugspoelen of Live?
  $('ballon').hidden = true
  await wacht(CONFIG.tempo.finalePauze); if (!door()) return
  w.naadFlits()
  healHerstel(false)
  await wacht(1.6); if (!door()) return
  geluid.pagina()
  await tot(w.boekDicht()); if (!door()) return
  geluid.klap()
  await tot(w.zegelVal()); if (!door()) return
  w.schaduwAchrona()
  await wacht(1.8); if (!door()) return
  geluid.pagina()
  await tot(w.boekOpen()); if (!door()) return
  $('k-vonnis').disabled = false
  openVonnis()
}

function openVonnis() {
  const v = S.verdict
  if (!v) return
  const t = S.trace
  const eersteZin = (s) => (String(s || '').split(/(?<=[.!?])\s+/)[0] || '')
  const ids = (l) => (l || []).map((i) => `<span class="idlabel">${esc(i)}</span>`).join('')
  const hoofdstukken = SLOTS.map(([k, titel]) => {
    const s = v.oorzaak?.[k] || {}
    if (!s.bewering) return `<div class="hoofdstuk gescheurd" data-slot="${k}"><h4>${titel}</h4><p>Gescheurd: de Council kon dit deel niet met bewijs herstellen.</p></div>`
    const z = typeof s.zekerheid === 'number' ? s.zekerheid : 1
    return `<div class="hoofdstuk" data-slot="${k}"><h4>${titel}</h4><p>${esc(eersteZin(s.bewering))}</p>
      <div>${ids(s.bewijs)}</div><div class="naad" title="zekerheid ${Math.round(z * 100)}%"><span style="width:${Math.round(z * 100)}%;opacity:${0.4 + z * 0.6}"></span></div></div>`
  }).join('')
  const stappen = (v.acties || []).map((a) => `<li>${esc(eersteZin(a.actie))}</li>`).join('')
  const zegels = (v.risicos || []).map((r) => `<div class="zegel-r"><span class="lak"></span><div>${esc(eersteZin(r.risico))}<small>${esc(eersteZin(r.mitigatie))}</small></div></div>`).join('')
  let schijf = ''
  if (v.voorspelling) {
    const nu = laatsteDag(t), dag = v.voorspelling.dag
    schijf = `<h3>Voorspelling</h3><div class="draaischijf">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#e8d6ae" stroke="#5a2e0c" stroke-width="2"/>
        <g id="schijf">${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="6" x2="50" y2="14" stroke="#5a2e0c" stroke-width="2" transform="rotate(${i * 30} 50 50)"/>`).join('')}
        <path d="M50 50 L50 12" stroke="#E8562A" stroke-width="4"/></g>
        <circle cx="50" cy="50" r="17" fill="#f3e8cf" stroke="#5a2e0c"/><text x="50" y="49" text-anchor="middle" font-size="9" font-family="Alegreya SC">dag</text>
        <text x="50" y="61" text-anchor="middle" font-size="14" font-weight="700" font-family="Alegreya SC">${esc(dag)}</text></svg>
      <div>${esc(eersteZin(v.voorspelling.bewering))}${nu ? ` <i>(nog ${Math.max(0, dag - nu)} dagen na dag ${nu})</i>` : ''}<div>${ids(v.voorspelling.bewijs)}</div></div></div>`
  }
  const geschillen = (t.geschillen || []).map((g) => `<li>${esc(g.onderwerp)}: <i>${g.uitkomst ? esc(eersteZin(g.uitkomst)) : 'niet beslecht'}</i></li>`).join('')
  const tokens = Object.values(t.verbruik || {}).reduce((s, x) => s + (x.invoer || 0) + (x.uitvoer || 0), 0)
  $('vonnis-blad').innerHTML = `
    <h1>Het Vonnis van de Council</h1>
    <p class="sub">${esc(eersteZin(v.samenvatting))}</p>
    <div class="hoofdstukken">${hoofdstukken}</div>
    <h3>Herstelplan</h3><ol class="stappen">${stappen}</ol>
    <h3>Risico's</h3><div class="zegels">${zegels}</div>
    ${schijf}
    ${geschillen ? `<h3>Geschillen</h3><ul class="stappen">${geschillen}</ul>` : ''}
    <div class="voetnoot">${tokens ? `${tokens.toLocaleString('nl-BE')} tokens · ` : ''}run ${esc(v.run_id)}</div>`
  $('vonnis-blad').querySelectorAll('.hoofdstuk').forEach((h) => (h.onclick = () => toonPaneel(`Verdict: ${h.dataset.slot}`, v.oorzaak?.[h.dataset.slot], '#F0A830')))
  $('vonnis').hidden = false
  gsap.fromTo('#vonnis-blad', { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' })
  gsap.from('#vonnis-blad > *', { opacity: 0, y: 8, stagger: 0.12, duration: 0.5, delay: 0.4 })
  if (v.voorspelling) gsap.fromTo('#schijf', { rotation: 0, transformOrigin: '50% 50%' }, { rotation: (v.voorspelling.dag % 12) * 30 + 720, duration: 2.4, ease: 'power3.out', delay: 1 })
}

// ------------------------------------------------------------------ de speler

async function speler() {
  if (S.bezig) { S.opnieuw = true; return }
  S.bezig = true
  const gen = S.gen
  try {
    while (S.spelen && S.trace && S.pos < S.trace.beurten.length && gen === S.gen) {
      await speel(S.trace.beurten[S.pos], S.pos)
      if (!S.spelen || gen !== S.gen) break
      S.pos++
      zetStatus()
    }
    if (gen === S.gen && S.spelen && S.trace && S.pos >= S.trace.beurten.length && klaar() && !S.finaleGedaan) await finale()
  } finally {
    S.bezig = false
    if (S.opnieuw) { S.opnieuw = false; if (S.spelen) speler() }
  }
}

async function opening() {
  const w = S.w
  const titel = $('titel'), echt = titel.textContent
  const tekens = '█▓▒░<>/\\#@$%01'
  const o = { n: 0 }
  geluid.glitch()
  await gsap.to(o, {
    n: echt.length, duration: 1.4 * CONFIG.tempo.opening, ease: 'none',
    onUpdate: () => (titel.innerHTML = esc(echt.slice(0, Math.floor(o.n))) + `<span class="glitch">${[...echt.slice(Math.floor(o.n))].map((c) => (c === ' ' ? ' ' : tekens[Math.floor(Math.random() * tekens.length)])).join('')}</span>`),
  }).then()
  titel.textContent = echt
  for (let i = 0; i < CONFIG.kaarsen; i++) { w.kaarsAan(i); await wacht(0.12 * CONFIG.tempo.opening) }
  geluid.pagina(); w.paginaOm()
  await wacht(0.4)
  geluid.pagina(); w.paginaOm()
  w.koningRecht()
  await wacht(1.2 * CONFIG.tempo.opening)
  S.geopend = true
}

// ------------------------------------------------------------------ data

async function nieuweRun(trace) {
  const leden = trace.raadsleden || []
  if (S.w && leden.join() !== S.leden.join()) return location.reload() // andere Raadsleden: scène opnieuw opbouwen
  S.leden = leden
  S.runId = trace.run_id
  S.trace = trace
  S.pos = 0
  S.finaleGedaan = false
  if (!S.w) {
    S.w = await maakWereld($('scene'), leden)
    S.w.onKlik((rol) => {
      const beurten = S.trace.beurten.slice(0, Math.max(S.pos, 1)).filter((b) => b.spreker === rol || b.aan === rol)
      toonPaneel(naamVan(rol), beurten.length ? beurten : [{ spreker: rol, opmerking: 'nog geen beurten tot hier' }], rol === 'koning' ? '#1D4ED8' : kleurVan(rol, leden.indexOf(rol)))
    })
  }
  toonTot(0)
  S.w.kaarsen.forEach((_, i) => S.w.kaarsUit(i, true))
  S.w.koningRecht(true)
  if (!S.geopend) await opening()
  else S.w.kaarsen.forEach((_, i) => S.w.kaarsAan(i, true))
}

let vorigeSleutel = ''
async function poll() {
  const [tr, vr] = await Promise.all([haal('trace.json'), haal('verdict.json')])
  if (vr.ok) S.verdict = vr.data
  if (!tr.ok) return
  const trace = tr.data
  if (!trace || !Array.isArray(trace.beurten)) {
    $('leeg').hidden = !!S.trace
    return
  }
  $('leeg').hidden = true
  const sleutel = `${trace.run_id}|${trace.beurten.length}|${trace.status}|${S.verdict?.run_id}`
  if (sleutel === vorigeSleutel) return // niets veranderd
  vorigeSleutel = sleutel
  if (trace.run_id !== S.runId) await nieuweRun(trace)
  else S.trace = trace
  zetStatus()
  if (S.spelen) speler()
}

// ------------------------------------------------------------------ bediening

function koppel() {
  const speelKnop = $('k-speel')
  const werk = () => { speelKnop.textContent = S.spelen ? '❚❚' : '▶'; zetStatus() }
  speelKnop.onclick = () => {
    S.spelen = !S.spelen
    if (S.spelen && S.trace && S.pos >= S.trace.beurten.length) { S.pos = 0; S.finaleGedaan = false; toonTot(0) }
    werk()
    if (S.spelen) speler()
  }
  $('k-live').onclick = () => {
    if (!S.trace) return
    S.pos = S.trace.beurten.length
    toonTot(S.pos)
    S.spelen = true
    werk()
    speler()
  }
  const snelheden = [0.5, 1, 2]
  $('k-snel').onclick = () => {
    S.snelheid = snelheden[(snelheden.indexOf(S.snelheid) + 1) % snelheden.length]
    gsap.globalTimeline.timeScale(S.snelheid)
    $('k-snel').textContent = `${S.snelheid}×`
  }
  $('k-geluid').onclick = () => { geluid.zet(!geluid.aan); $('k-geluid').textContent = geluid.aan ? '🔊' : '🔇' }
  $('k-lite').onclick = () => { const aan = !$('k-lite').classList.contains('aan'); $('k-lite').classList.toggle('aan', aan); S.w?.zetLite(aan) }
  $('k-vonnis').onclick = openVonnis
  $('vonnis-sluit').onclick = () => ($('vonnis').hidden = true)
  $('paneel-sluit').onclick = () => ($('paneel').hidden = true)
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('paneel').hidden = true; $('vonnis').hidden = true }
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); speelKnop.click() }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && S.trace) { // terugbladeren: elke pagina = één Raadslid-beurt
      const grenzen = [0, ...S.trace.beurten.map((b, i) => (b.soort === 'bericht' ? i + 1 : null)).filter((x) => x !== null)]
      const doel = e.key === 'ArrowLeft' ? [...grenzen].reverse().find((g) => g < S.pos) : grenzen.find((g) => g > S.pos)
      if (doel === undefined) return
      S.spelen = false
      S.pos = doel
      toonTot(doel)
      werk()
      geluid.pagina()
    }
  })
  if (DEBUG) {
    $('fps').hidden = false
    setInterval(() => ($('fps').textContent = `${S.w?.fps() ?? 0} fps`), 500)
  }
}

koppel()
poll()
setInterval(poll, CONFIG.pollMs)
