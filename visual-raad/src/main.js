// De Raadzaal van Achrona: speelt trace.json + verdict.json af als een raadszitting bij kaarslicht.
// Leest alleen (via /data/...), schrijft niets terug en roept geen LLM aan. Elk element komt uit de trace.
import gsap from 'gsap'
import { CONFIG, kleurVan, naamVan } from './config.js'
import { haal, idsIn, kernVan, kortZin, normaalID, BRON } from './data.js'
import { maakZaal } from './zaal.js'

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const T = CONFIG.tempo, W = CONFIG.tekst
const SLOTS = [['ingreep', 'Ingreep', 'Wie deed wat, en wanneer?'], ['mechanisme', 'Mechanisme', 'Hoe leidde dat tot de Desync?'], ['verloop', 'Verloop', 'Welk patroon zien we in de tijd?']]

const zaal = maakZaal($('scene'))

// ---------------------------------------------------------------- toestand
let trace = null, verdict = null, beurten = [], rollen = [], extras = [], portret = {}
let pos = 0, spelend = true, snel = 1, timer = null, vorigeSleutel = '', presentatie = false, lite = false
let st = leeg()
let rolRe = {}, camTimer = null
let technisch = false, gestart = false // taal: eenvoudig (standaard) of technisch; gestart: het startscherm is weg

function leeg() { return { goud: new Map(), berichten: 0, rout: null, msg: null, tool: null, besluit: null, vragen: [], weg: [], fase: 'debat', paren: [], gi: -1, pagina: 0, verwijzing: null, sprekers: [], bevestiging: null } }
const n = () => beurten.length
const totaal = () => n() + extras.length
const isRol = (r) => rollen.includes(r)
const kleur = (r) => kleurVan(r, rollen.indexOf(r))
const verdictOk = () => !!(verdict && trace && verdict.run_id === trace.run_id && verdict.oorzaak)
/** Live: wie is er aan de beurt terwijl we op de volgende beurt wachten? */
const denkerNu = () => trace && trace.status === 'bezig' && pos >= n() && (trace.aan_het_woord === 'koning' || isRol(trace.aan_het_woord)) ? trace.aan_het_woord : null
const plaatje = (r) => portret[r] ? `<img src="${portret[r]}" alt="" style="--k:${kleur(r)}">` : ''

/** De toestand na `p` stappen, volledig afgeleid uit de trace. */
function toestand(p) {
  const t = leeg()
  for (let i = 0; i < Math.min(p, n()); i++) {
    const b = beurten[i]
    if (b.soort === 'routering') {
      t.rout = { b, i }; t.msg = null; t.tool = null
      if (Array.isArray(b.open_vragen)) { t.weg = t.vragen.filter((v) => !b.open_vragen.includes(v)); t.vragen = b.open_vragen }
    } else if (b.soort === 'toolcall' || b.soort === 'bestand') {
      t.tool = { b, i }
      if (t.msg && t.msg.b.spreker !== b.spreker) t.msg = null
    } else if (b.soort === 'bericht') {
      if (b.spreker === 'koning') { t.besluit = { b, i }; t.msg = null; continue }
      t.msg = { b, i }; t.tool = null
      t.paren.push({ rout: t.rout && t.rout.b.aan === b.spreker ? t.rout.b : null, msg: b })
      if (!isRol(b.spreker)) continue
      t.verwijzing = { b, i, van: b.spreker, naar: rollen.filter((x) => x !== b.spreker && rolRe[x]?.test(b.tekst || '')) } // welke Rollen noemt hij?
      t.berichten++
      if (!t.sprekers.includes(b.spreker)) t.sprekers.push(b.spreker)
      const bev = new Set() // van wie noemt hij een bewijsstuk?
      for (const id of idsIn(b.tekst)) {
        const g = t.goud.get(id)
        if (!g) t.goud.set(id, { id, rol: b.spreker, links: [] })
        else if (g.rol !== b.spreker) { bev.add(g.rol); if (!g.links.includes(b.spreker)) g.links.push(b.spreker) }
      }
      t.bevestiging = { b, wie: [...bev] }
    }
  }
  if (t.tool && t.tool.i !== Math.min(p, n()) - 1) t.tool = null
  const extra = p > n() ? extras[p - n() - 1] : null
  t.fase = extra?.soort === 'f' ? 'finale' : extra?.soort === 'g' ? 'geschil' : 'debat'
  t.gi = extra?.soort === 'g' ? extra.i : -1
  t.pagina = extra?.soort === 'f' ? extra.pagina : 0
  return t
}

// ---------------------------------------------------------------- paneel met de ruwe trace
function toonPaneel(titel, items) {
  $('paneel-titel').textContent = titel
  $('paneel-inhoud').innerHTML = (items || []).filter((x) => x != null).map((x) => `<pre>${esc(JSON.stringify(x, null, 2))}</pre>`).join('') || '<p>Nog niets in de trace.</p>'
  $('paneel').hidden = false
}
$('paneel-sluit').onclick = () => { $('paneel').hidden = true }

// ---------------------------------------------------------------- namen boven de personages
function bouwLabels() {
  $('labels').innerHTML = ['koning', ...rollen].map((r) => `<div class="label" data-rol="${esc(r)}" style="--k:${kleur(r)}">${esc(naamVan(r))}<span class="doet"></span></div>`).join('')
}
zaal.opFrame = () => {
  const verberg = st.fase === 'finale'
  for (const d of $('labels').children) {
    const p = zaal.project(d.dataset.rol)
    const actief = d.classList.contains('actief')
    const zicht = !verberg && p.zichtbaar && p.y < innerHeight * 0.66 && (actief || !zaal.dichtbij) // van dichtbij alleen de naam van de spreker
    d.style.opacity = zicht ? (actief ? 1 : 0.7) : 0
    d.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(Math.max(p.y, 92))}px) translate(-50%, -100%)`
  }
}

// ---------------------------------------------------------------- dialoogvenster
let typTween = null
function typ(el, tekst, animeer) {
  typTween?.kill()
  if (!animeer || !tekst) { el.textContent = tekst || ''; return }
  const o = { k: 0 }
  const zet = () => { const k = Math.round(o.k); el.innerHTML = `${esc(tekst.slice(0, k))}<span class="rest">${esc(tekst.slice(k))}</span>` }
  zet()
  typTween = gsap.to(o, { k: tekst.length, duration: Math.min(2.6, 0.4 + tekst.length * 0.016) / snel, ease: 'none', onUpdate: zet })
}
let vorigeSpreker = null
function dialoog({ wie, icoon, kop, tekst = '', lijst = '', chips = '', sub = '', subKlasse = '', k, klik }, animeer) {
  const d = $('dialoog')
  d.hidden = false; d.style.setProperty('--k', k || kleur(wie)); d.onclick = klik || null
  $('d-portret').innerHTML = icoon ? esc(icoon) : (portret[wie] ? `<img src="${portret[wie]}" alt="">` : '')
  $('d-kop').innerHTML = kop
  typ($('d-tekst'), tekst, animeer)
  $('d-lijst').innerHTML = lijst; $('d-chips').innerHTML = chips
  $('d-sub').textContent = sub; $('d-sub').className = 'd-sub ' + subKlasse
  const sleutel = icoon || wie
  if (animeer && sleutel !== vorigeSpreker) gsap.fromTo('#d-portret', { scale: 0.6, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.5 / snel, ease: 'back.out(2)' })
  if (animeer && chips) gsap.from('#d-chips .chip', { y: 10, opacity: 0, duration: 0.3 / snel, stagger: 0.06 / snel, delay: 0.5 / snel })
  vorigeSpreker = sleutel
}
const chipsVan = (ids) => ids.slice(0, W.idChips).map((i) => `<span class="chip">${esc(i)}</span>`).join('') + (ids.length > W.idChips ? `<span class="chip meer">+${ids.length - W.idChips} meer</span>` : '')

// ---------------------------------------------------------------- leesbaar maken
// Een record-ID (drie letters van de Rol, een streepje en een nummer) is het nummer van één bewijsstuk uit de bron van een Raadslid. In beeld tonen we wat het
// betekent ("een bewijsstuk van de Beast Master"); de nummers zelf staan achter de toets I en in de ruwe trace.
const PREFIX = { ARC: 'archmage', ENG: 'engineer', GUA: 'guardian_keeper', HIS: 'historian', ORA: 'oracle', BEA: 'beast_master' }
let eigenaarVan = new Map() // id -> het Raadslid dat het als eerste noemde (voor ID's met een onbekend voorvoegsel)
const rolVanId = (id) => { const r = PREFIX[id.slice(0, 3)]; return r && isRol(r) ? r : eigenaarVan.get(id)?.rol || null }
const ID_EEN = '[A-Z]{3}[-‐‑‒–—―−]\\d{3}'
const ID_HAAKJES = new RegExp('\\s*\\((?:\\s*' + ID_EEN + '\\s*(?:,|;|/|en|t/m|tot en met|tot)?\\s*)+\\)', 'g')
const ID_LOS = new RegExp(ID_EEN, 'g')
const HAAKJE_ID = new RegExp(String.raw`(\([^()]*?),\s*` + ID_EEN + String.raw`(?:\s*(?:,|en)\s*` + ID_EEN + String.raw`)*\s*\)`, 'g')
/** Dezelfde zin zonder nummers: een rij nummers tussen haakjes valt weg; een los nummer wordt "een bewijsstuk van de <Rol>". */
function leesbaar(tekst) {
  let t = String(tekst || '').replace(ID_HAAKJES, '')
  t = t.replace(HAAKJE_ID, '$1)') // "(tekst, <nummer>)" wordt "(tekst)"
  t = t.replace(ID_LOS, (id) => { const r = rolVanId(normaalID(id)); return r ? 'een bewijsstuk van de ' + naamVan(r) : 'een bewijsstuk' })
  t = t.replace(/(een bewijsstuk(?: van de [A-Z][A-Za-z ]*?)?)(?:(?:, | en | of | t\/m | tot en met )\1)+/g, (m, een) => een.replace('een bewijsstuk', 'bewijsstukken'))
  return t.replace(/\s+([.,;:!?])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()
}
/** Eenvoudig of technisch woord, naar de gekozen taal. */
const w = (eenvoudig, tech) => technisch ? tech : eenvoudig
/** Technisch: de zin zoals hij in de trace staat (met record-ID's). Eenvoudig: zonder nummers. */
const zin = (t) => technisch ? String(t || '') : leesbaar(t)
/** De SIMPEL-regel van een Raadslid (als de Council die schreef): dezelfde kern in woorden voor een kind van 13. */
const simpelVan = (tekst) => { const m = /^\s*[-*]?\s*\**SIMPEL\**\s*:\s*\**\s*(.+)$/im.exec(String(tekst || '')); return m ? m[1].replace(/\*\*|__|`/g, '').trim() : '' }
const stuks = (a) => a + ' bewijsstuk' + (a === 1 ? '' : 'ken')
/** Eén regel over het bewijs in een bericht: hoeveel uit de eigen bron, en naar wiens bewijs het verwijst. */
function bewijsRegel(ids, spreker) {
  if (!ids.length) return ''
  const eigen = ids.filter((i) => rolVanId(i) === spreker).length, ander = {}
  for (const i of ids) { const r = rolVanId(i); if (r && r !== spreker) ander[r] = (ander[r] || 0) + 1 }
  const delen = eigen ? ['📜 ' + stuks(eigen) + ' uit de eigen bron'] : []
  for (const [r, a] of Object.entries(ander)) delen.push('🔗 verwijst naar ' + a + ' van de ' + naamVan(r))
  return (delen.length ? delen : ['📜 ' + stuks(ids.length)]).slice(0, 3).join('   ·   ')
}

function tekenHtml(animeer = false) {
  const fin = st.fase === 'finale', gsh = st.fase === 'geschil', laatste = st.fase === 'debat' ? beurten[Math.min(pos, n()) - 1] : null
  // wat gebeurt er nu? (de drie stappen van elke beurt)
  const stappen = $('stappen')
  const stap = !laatste || st.besluit ? 0 : laatste.soort === 'routering' ? (laatste.aan == null ? 0 : 1) : laatste.soort === 'bericht' ? (isRol(laatste.spreker) ? 3 : 0) : 2
  const denker = denkerNu()
  const titel = fin ? ['', w('Wat is er gebeurd?', 'Verdict · oorzaak'), w('Hoe lossen we het op?', 'Verdict · acties en risico\'s'), 'Waarom een Council?'][st.pagina] : gsh ? w('Waar waren ze het oneens?', 'Geschillen')
    : st.besluit ? 'De Koning beslist' : laatste?.soort === 'routering' && laatste.aan == null ? 'De Koning sluit het debat' : !laatste ? 'De Raad komt samen' : ''
  stappen.classList.toggle('titel', !!titel); stappen.dataset.titel = titel
  const stapNaam = technisch ? ['Routering door de Koning', 'Toolcall op de eigen Kennisbron', 'Bericht met record-ID\'s'] : ['De Koning stelt een vraag', 'Het Raadslid zoekt het op', 'Het Raadslid antwoordt']
  for (const li of stappen.children) { li.classList.toggle('aan', +li.dataset.s === stap); li.innerHTML = `<b>${li.dataset.s}</b> ${stapNaam[li.dataset.s - 1]}` }
  // namen
  const actief = fin ? null : gsh ? null : st.besluit ? 'koning' : laatste?.soort === 'routering' ? 'koning' : laatste?.spreker
  for (const d of $('labels').children) {
    const r = d.dataset.rol
    d.classList.toggle('actief', r === actief || r === denker || (gsh && Object.keys((trace.geschillen || [])[st.gi]?.standpunten || {}).includes(r)))
    d.querySelector('.doet').textContent = r === denker ? '💭 denkt na…' : st.tool && st.tool.b.spreker === r ? w('📖 zoekt het op…', '📖 ' + (st.tool.b.tool || 'bron in de prompt')) : ''
  }
  // dialoog: telkens één spreker, één zin, één regel uitleg
  const r = st.rout
  if (fin) $('dialoog').hidden = true
  else if (gsh) {
    const gs = trace.geschillen || [], g = gs[st.gi] || {}, wie = Object.keys(g.standpunten || {})
    dialoog({
      icoon: '⚡', k: g.uitkomst ? CONFIG.kleuren.goud : CONFIG.kleuren.geschil,
      kop: `${w('Onenigheid', 'Geschil')} ${st.gi + 1} van ${gs.length}<i class="stempel ${g.uitkomst ? 'ok' : 'open'}">${g.uitkomst ? w('Opgelost', 'Beslecht') : w('Nog open', 'Open')}</i>`,
      tekst: kortZin(zin(g.onderwerp), 16),
      lijst: wie.slice(0, 3).map((x) => `<div style="--k:${kleur(x)}">${plaatje(x)}<span><b>${esc(naamVan(x))}</b> ${esc(kortZin(zin(g.standpunten[x]), 15))}</span></div>`).join(''),
      sub: g.uitkomst ? '✔ ' + kortZin(zin(g.uitkomst), 20) : '', subKlasse: 'uitkomst',
      chips: chipsVan(g.bewijs || []), klik: () => toonPaneel(`Geschil ${st.gi + 1}`, [g]),
    }, animeer)
  } else if (st.besluit) {
    dialoog({ wie: 'koning', kop: 'De Koning<span>·</span><b>zijn besluit</b>', tekst: kortZin(zin(st.besluit.b.tekst), 30), klik: () => toonPaneel('De Koning besluit', [st.besluit.b]) }, animeer)
  } else if (st.msg) {
    const b = st.msg.b, ids = idsIn(b.tekst)
    dialoog({
      wie: b.spreker, k: b.spreker === 'mens' ? CONFIG.kleuren.geschil : kleur(b.spreker),
      kop: esc(naamVan(b.spreker)) + (CONFIG.belang[b.spreker] ? `<small class="belang">${w('komt op voor', 'Belang:')} ${esc(CONFIG.belang[b.spreker])}</small>` : ''),
      tekst: technisch ? kortZin(kernVan(b.tekst), 42) : (simpelVan(b.tekst) || kortZin(leesbaar(kernVan(b.tekst)), W.kernWoorden)),
      sub: technisch ? '' : bewijsRegel(ids, b.spreker), chips: chipsVan(ids),
      klik: () => toonPaneel(`Bericht #${b.nr ?? st.msg.i + 1} · ${naamVan(b.spreker)}`, [r?.b, b]),
    }, animeer && laatste === b)
  } else if (r && r.b.aan == null) {
    dialoog({
      wie: 'koning', kop: 'De Koning<span>·</span><b>sluit het debat</b>', tekst: kortZin(zin(r.b.reden), 28),
      sub: st.berichten < CONFIG.budget ? `Er branden nog ${CONFIG.budget - st.berichten} kaarsen: de Koning stopte zelf.` : 'Alle tien de beurten zijn gebruikt.',
      klik: () => toonPaneel('De Koning stopt', [r.b]),
    }, animeer)
  } else if (r) {
    $('dialoog').style.setProperty('--k2', kleur(r.b.aan))
    dialoog({
      wie: r.b.spreker, kop: `${esc(naamVan(r.b.spreker))}<span>${w('vraagt aan', '→')}</span><b>${esc(naamVan(r.b.aan))}</b>`,
      tekst: kortZin(zin(r.b.vraag), technisch ? 34 : W.vraagWoorden), sub: w('waarom: ', 'reden: ') + kortZin(zin(r.b.reden), technisch ? 24 : W.redenWoorden),
      klik: () => toonPaneel(`Keuze van de Koning #${r.b.nr ?? r.i + 1}`, [r.b]),
    }, animeer && laatste === r.b)
  } else if (trace) {
    dialoog({ wie: 'koning', kop: 'De Raad van Achrona', tekst: `De Koning en ${rollen.length} Raadsleden zoeken uit wat er misging in Achrona.`,
      sub: 'Elk Raadslid heeft een eigen bron. Elk blad op tafel is een bewijsstuk daaruit.' }, animeer)
  } else $('dialoog').hidden = true
  // nog uitzoeken: de twee belangrijkste open vragen van de Koning
  $('vragen-blok').hidden = fin || gsh || !st.vragen.length
  $('vragen').innerHTML = st.vragen.slice(0, W.openVragen).map((v) => `<li>${esc(kortZin(zin(v), W.openWoorden))}</li>`).join('')
    + (st.vragen.length > W.openVragen ? `<li class="meer">+ ${st.vragen.length - W.openVragen} meer</li>` : '')
  $('vragen-blok').querySelector('h2').textContent = w('Nog uitzoeken', 'open_vragen')
  $('vragen-blok').onclick = () => toonPaneel('Open vragen van de Koning', [st.rout?.b])
  $('historie').hidden = true
  // beurten: tien lichtjes, net als de kaarsen op tafel
  $('budget').innerHTML = Array.from({ length: CONFIG.budget }, (_, i) => `<i class="${i >= CONFIG.budget - st.berichten ? 'uit' : ''}"></i>`).join('')
  $('budget').onclick = () => toonPaneel(`Beurten: ${st.berichten} van ${CONFIG.budget} gebruikt`, [{ raadslid_beurten: st.berichten, budget: CONFIG.budget, verbruik: trace?.verbruik }])
  // vonnis
  $('vonnis').hidden = !fin
  if (fin) tekenVonnis(animeer)
  $('k-stap').textContent = `${pos}/${totaal()}`
  $('k-speel').textContent = spelend ? '❚❚' : '▶'
  $('k-snel').textContent = (Number.isInteger(snel) ? snel : snel.toFixed(1)) + '×'
}

/** Het vonnis in drie schermen: wat is er gebeurd, hoe lossen we het op, en waarom een Council. */
const DELEN = [['ingreep', 'Wie deed wat?', 'Ingreep'], ['mechanisme', 'Hoe ging het mis?', 'Mechanisme'], ['verloop', 'Hoe verloopt het?', 'Verloop']]
function tekenVonnis(animeer) {
  const el = $('vonnis'), o = verdict.oorzaak
  if (st.pagina === 3) return tekenCijfers(el, animeer)
  if (st.pagina === 1) {
    const uitleg = technisch ? verdict.samenvatting : verdict.samenvatting_eenvoudig // de uitleg in gewone woorden schrijft de Koning zelf (extra veld)
    el.innerHTML = `<h2>${w('Wat is er gebeurd?', 'Oorzaak')}</h2>${uitleg ? `<p class="v-sam">${esc(uitleg)}</p>` : ''}<div class="v-rij" style="margin-top:12px">` + DELEN.map(([k, eenvoudig, tech]) => {
      const vraag = w(eenvoudig, tech)
      const s = o[k] || {}
      if (!s.bewering) return `<article class="v-kaart leeg" data-k="${k}"><h3>${vraag}</h3><p>Dat weten we nog niet: er kwam geen bewijs voor op tafel.</p></article>`
      const bewijs = s.bewijs || [], wie = [...new Set(bewijs.map(rolVanId).filter(Boolean))], pct = Math.round((s.zekerheid ?? 0) * 100)
      return `<article class="v-kaart" data-k="${k}"><h3>${vraag}</h3><p>${esc(kortZin(zin(s.bewering), W.vonnisWoorden))}</p>`
        + `<div class="chips klein">${chipsVan(bewijs)}</div>`
        + `<div class="v-voet"><span class="v-av">${wie.map(plaatje).join('')}</span><span>${stuks(bewijs.length)}</span>`
        + (typeof s.zekerheid === 'number' ? `<span class="balk-z"><i style="width:${pct}%"></i></span><span>${pct}% zeker</span>` : '') + '</div></article>'
    }).join('') + '</div>'
  } else {
    const v = verdict.voorspelling
    el.innerHTML = `<h2>${w('Hoe lossen we het op?', 'Acties en risico\'s')}</h2><div class="v-rij twee" style="margin-top:12px">`
      + `<article class="v-kaart"><h3>${w('Dit gaan we doen', 'Herstelplan')}<small>in deze volgorde</small></h3><ol>${(verdict.acties || []).slice(0, 4).map((a, i) => `<li data-a="${i}">${esc(kortZin(zin(a.actie), W.actieWoorden))}</li>`).join('')}</ol></article>`
      + `<article class="v-kaart"><h3>${w('Wat kan er misgaan?', 'Risico\'s en mitigatie')}</h3>${(verdict.risicos || []).slice(0, 2).map((x, i) => `<div class="risico" data-r="${i}">${esc(kortZin(zin(x.risico), W.actieWoorden))}<small>→ ${esc(kortZin(zin(x.mitigatie), 12))}</small></div>`).join('')}`
      + (v ? `<h3 style="margin-top:14px">${w('Als niemand iets doet', 'Voorspelling')}</h3><p data-v="1"><span class="dag">dag ${esc(v.dag)}</span><br>${esc(kortZin(zin(v.bewering), W.actieWoorden))}</p>` : '') + '</article></div>'
  }
  el.onclick = (e) => {
    const d = e.target.closest('[data-k],[data-a],[data-r],[data-v]')?.dataset
    if (!d) return toonPaneel('Council Verdict', [verdict])
    if (d.k) toonPaneel('Oorzaak: ' + d.k, [o[d.k]])
    else if (d.a) toonPaneel('Actie ' + (+d.a + 1), [verdict.acties[d.a]])
    else if (d.r) toonPaneel('Risico', [verdict.risicos[d.r]])
    else toonPaneel('Voorspelling', [verdict.voorspelling])
  }
  if (animeer) { gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 / snel, ease: 'power2.out' }); gsap.from('#vonnis .v-kaart, #vonnis ol li, #vonnis .risico', { y: 18, opacity: 0, duration: 0.45 / snel, stagger: 0.14 / snel, delay: 0.35 / snel }) }
}

/** Wat de Raad samen bereikte, geteld uit de trace, en de spelregels nagelopen. */
function cijfers() {
  const eind = toestand(n()), gs = trace.geschillen || [], routs = beurten.filter((b) => b.soort === 'routering')
  const sprekers = new Set(), gelezen = new Set(), vast = new Set()
  let padFout = 0, koningLas = 0, zonderRout = 0, zonderBron = 0, mens = 0, toegewezen = null
  for (const b of beurten) {
    if (b.spreker === 'mens') mens++
    if (b.soort === 'routering') { toegewezen = b.aan; gelezen.clear() }
    else if (b.soort === 'toolcall' || b.soort === 'bestand') {
      if (b.spreker === 'koning') { koningLas++; continue }
      if (b.soort === 'bestand') { vast.add(b.spreker); if (b.bestand && !b.bestand.startsWith(b.spreker + '/')) padFout++ }
      else { gelezen.add(b.spreker); if (b.pad && !b.pad.includes('/' + b.spreker + '/')) padFout++ }
    } else if (b.soort === 'bericht' && isRol(b.spreker)) {
      sprekers.add(b.spreker)
      if (toegewezen !== b.spreker) zonderRout++
      if (!gelezen.has(b.spreker) && !vast.has(b.spreker)) zonderBron++
      toegewezen = null
    }
  }
  const laatste = routs.at(-1)
  return {
    tegels: [
      [sprekers.size, 'van de ' + rollen.length + ' Raadsleden spraken'],
      [eind.goud.size, 'bewijsstukken op tafel'],
      [[...eind.goud.values()].filter((g) => g.links.length).length, 'ook genoemd door een tweede Raadslid'],
      [gs.filter((g) => g.uitkomst).length, 'van de ' + gs.length + ' onenigheden opgelost'],
    ],
    regels: [
      [padFout === 0, 'Elk Raadslid las alleen zijn eigen bron'],
      [koningLas === 0, 'De Koning las zelf geen enkele bron'],
      [zonderBron === 0, 'Iedereen zocht het eerst op en sprak daarna'],
      [zonderRout === 0, 'De Koning koos elke spreker'],
      [eind.berichten <= CONFIG.budget, 'Hoogstens ' + CONFIG.budget + ' beurten (' + eind.berichten + ' gebruikt)'],
      [mens === 0, 'Geen hulp van mensen'],
      [verdictOk(), 'Het vonnis hoort bij dit debat'],
      [!!laatste && laatste.aan == null && eind.berichten < CONFIG.budget, 'Extra: de Koning stopte zelf', true],
    ],
  }
}
function tekenCijfers(el, animeer) {
  const c = cijfers()
  el.innerHTML = '<h2>Waarom een Council?</h2><p class="v-sam">Elk Raadslid kent maar een stukje van het verhaal. Samen kwamen ze hiertoe.</p><div class="v-rij twee">'
    + `<div class="tegels">${c.tegels.map(([nr, t]) => `<div class="tegel"><b data-n="${nr}">${nr}</b><span>${esc(t)}</span></div>`).join('')}</div>`
    + `<article class="v-kaart"><h3>Spelregels gecontroleerd</h3>${c.regels.map(([ok, t, extra]) => `<div class="regel ${ok ? 'ok' : extra ? 'nvt' : 'fout'}">${esc(t)}</div>`).join('')}</article></div>`
  el.onclick = () => toonPaneel('Geteld uit trace.json', [{ run_id: trace.run_id, cijfers: Object.fromEntries(c.tegels.map(([nr, t]) => [t, nr])), spelregels: Object.fromEntries(c.regels.map(([ok, t]) => [t, ok])), verbruik: trace.verbruik }])
  if (animeer) {
    gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 / snel, ease: 'power2.out' })
    for (const b of el.querySelectorAll('.tegel b')) { const o = { v: 0 }; gsap.to(o, { v: +b.dataset.n, duration: 1.4 / snel, ease: 'power1.out', onUpdate: () => { b.textContent = Math.round(o.v) } }) }
    gsap.from('#vonnis .regel', { x: -16, opacity: 0, duration: 0.35 / snel, stagger: 0.16 / snel, delay: 0.5 / snel })
  }
}

// ---------------------------------------------------------------- stappen
function zet(nieuw, animeer) {
  const oud = pos
  pos = Math.max(0, Math.min(nieuw, totaal()))
  st = toestand(pos)
  animeer = animeer && pos === oud + 1
  const D = animeer ? 1.5 / Math.max(1, snel * 0.8) : 0
  clearTimeout(camTimer)
  zaal.zetBudget(CONFIG.budget - st.berichten, animeer)
  zaal.zetPapieren([...st.goud.values()].map((g) => ({ id: g.id, rol: g.rol, gedeeld: g.links.length > 0 })), animeer, snel)
  zaal.zetHerstel(st.fase === 'finale' ? 1 : Math.min(0.85, st.goud.size / 40))
  if (st.fase === 'finale') {
    zaal.zetFocus(null); zaal.straal(null); zaal.zetGeschil(null)
    zaal.zetFinale(SLOTS.map(([k]) => verdict.oorzaak[k]?.bewering ? (verdict.oorzaak[k].bewijs || []) : []), animeer && st.pagina === 1, snel)
    zaal.camNaar('finale', null, animeer ? 2.4 / snel : 0)
  } else if (st.fase === 'geschil') {
    const g = (trace.geschillen || [])[st.gi] || {}, wie = Object.keys(g.standpunten || {}).filter(isRol)
    zaal.zetFinale(null, false); zaal.zetFocus(null); zaal.straal(null)
    zaal.zetGeschil({ rollen: wie, beslecht: !!g.uitkomst }); zaal.camNaar('duo', wie, D)
  } else {
    zaal.zetFinale(null, false); zaal.zetGeschil(null)
    const b = beurten[pos - 1]
    if (!b) { zaal.zetFocus(null); zaal.straal(null); zaal.camNaar('breed', null, D) }
    else if (st.besluit) { zaal.zetFocus('koning'); zaal.straal(null); zaal.camNaar('persoon', 'koning', D) }
    else if (b.soort === 'routering') {
      if (b.aan == null) { zaal.zetFocus('koning'); zaal.straal(null); zaal.camNaar('breed', null, D) }
      else {
        zaal.zetFocus('koning', { naar: b.aan }); zaal.straal(b.aan, animeer, snel)
        if (animeer) { zaal.camNaar('persoon', 'koning', D); camTimer = setTimeout(() => zaal.camNaar('duo', ['koning', b.aan], 1.4 / Math.max(1, snel * 0.8)), duur(pos - 1) * 480 / snel) }
        else zaal.camNaar('duo', ['koning', b.aan], 0)
      }
    } else if (b.soort === 'toolcall' || b.soort === 'bestand') {
      zaal.zetFocus(b.spreker, { leest: true }); zaal.straal(st.rout?.b.aan === b.spreker ? b.spreker : null, false); zaal.camNaar(isRol(b.spreker) ? 'persoon' : 'breed', b.spreker, D)
    } else { zaal.zetFocus(isRol(b.spreker) ? b.spreker : null, { naar: 'koning' }); zaal.straal(null); zaal.camNaar(isRol(b.spreker) ? 'persoon' : 'breed', b.spreker, D) }
  }
  // live: wie is aan de beurt?  en: welke Rollen werden net genoemd?
  const denker = denkerNu(), nu = st.fase === 'debat' ? beurten[pos - 1] : null
  zaal.zetDenker(denker)
  if (denker && st.fase === 'debat') { clearTimeout(camTimer); zaal.camNaar('persoon', denker, D || 1.2) }
  zaal.zetGenoemd(st.verwijzing && nu && (nu === st.verwijzing.b || (nu.soort === 'routering' && pos - 1 === st.verwijzing.i + 1)) ? st.verwijzing.naar : [])
  // bevestigd bewijs: wie zijn bewijsstuk door de spreker genoemd wordt, krijgt een vinkje; de camera laat ze daarna samen zien
  const bevestigd = st.bevestiging && nu === st.bevestiging.b ? st.bevestiging.wie : []
  zaal.zetBevestigd(bevestigd)
  if (animeer && bevestigd.length && !denker) camTimer = setTimeout(() => zaal.camNaar('duo', [nu.spreker, bevestigd[0]], 1.4 / Math.max(1, snel * 0.8)), duur(pos - 1) * 560 / snel)
  zaal.zetSpaken(st.sprekers, animeer) // het sigil als puzzel: één spaak per Raadslid dat al sprak
  tekenHtml(animeer)
}

function duur(stap) {
  if (stap >= n()) return extras[stap - n()].soort === 'g' ? T.geschil : T.finale
  const b = beurten[stap]
  if (b.soort === 'routering') return b.aan == null ? T.stop : T.routering
  if (b.soort === 'toolcall' || b.soort === 'bestand') return T.toolcall
  return Math.min(T.berichtMax, Math.max(T.berichtMin, 1.6 + kernVan(b.tekst).split(/\s+/).length * T.berichtPerWoord))
}
function tik() {
  clearTimeout(timer)
  if (!spelend || !gestart) return
  if (pos < totaal()) { zet(pos + 1, true); timer = setTimeout(tik, duur(pos - 1) * 1000 / snel) }
  else timer = setTimeout(tik, 400) // live: wachten op een nieuwe beurt
}
function speel(aan) { spelend = aan; tekenHtml(); if (aan) tik(); else clearTimeout(timer) }
function herstart() {
  if (!trace) return
  clearTimeout(timer); vorigeSpreker = null
  zaal.camNaar('breed', null, 0); zet(0, false); spelend = true; tekenHtml(true)
  timer = setTimeout(tik, T.opening * 1000 / Math.max(1, snel))
}
function presenteer() { // de hele run in ongeveer CONFIG.presentatieSeconden
  presentatie = !presentatie
  document.body.classList.toggle('presentatie', presentatie); $('k-pres').classList.toggle('aan', presentatie)
  if (presentatie) { let som = T.opening; for (let i = 0; i < totaal(); i++) som += duur(i); snel = Math.min(6, Math.max(0.6, som / CONFIG.presentatieSeconden)) } else snel = 1
  herstart()
}

// ---------------------------------------------------------------- bediening
$('k-speel').onclick = () => speel(!spelend)
$('k-live').onclick = () => { zet(totaal(), false); speel(true) }
$('k-snel').onclick = () => { snel = snel === 1 ? 2 : snel === 2 ? 0.5 : 1; tekenHtml() }
$('k-lite').onclick = () => { lite = !lite; $('k-lite').classList.toggle('aan', lite); zaal.setLite(lite) }
$('k-pres').onclick = presenteer
function wisselTaal(naar) {
  technisch = typeof naar === 'boolean' ? naar : !technisch
  document.body.classList.toggle('ids', technisch) // technisch: de record-ID's staan erbij
  $('k-ids').textContent = technisch ? 'Taal: technisch' : 'Taal: eenvoudig'
  $('s-eenvoudig').classList.toggle('aan', !technisch); $('s-technisch').classList.toggle('aan', technisch)
  vorigeSpreker = null; tekenHtml()
}
$('k-ids').onclick = () => wisselTaal()
$('s-eenvoudig').onclick = () => wisselTaal(false)
$('s-technisch').onclick = () => wisselTaal(true)
/** Het startscherm sluiten en de zitting beginnen. */
function begin(pres) {
  if (gestart || !trace) return
  gestart = true; $('start').hidden = true; document.body.classList.remove('wacht'); zaal.draai = false
  if (trace.status === 'bezig') { zet(n(), false); speel(true) } // een lopende run volg je live
  else if (pres) presenteer()
  else herstart()
}
$('s-start').onclick = () => begin(false)

addEventListener('keydown', (e) => {
  if (!gestart) { // op het startscherm
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); begin(false) } else if (e.code === 'KeyP') begin(true); else if (e.code === 'KeyT') wisselTaal()
    return
  }
  if (e.code === 'Space') { e.preventDefault(); speel(!spelend) }
  else if (e.code === 'ArrowRight') { speel(false); zet(pos + 1, true) }
  else if (e.code === 'ArrowLeft') { speel(false); zet(pos - 1, false) }
  else if (e.code === 'KeyP') presenteer()
  else if (e.code === 'KeyR') herstart()
  else if (e.code === 'KeyT' || e.code === 'KeyI') wisselTaal()
  else if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}) }
  else if (e.code === 'Escape') $('paneel').hidden = true
})
zaal.canvas.addEventListener('click', (e) => { // klik op een blad bewijs of op een personage: de ruwe trace
  const raak = zaal.kies(e.clientX, e.clientY), tot = beurten.slice(0, Math.min(pos, n()))
  if (raak?.id) toonPaneel(`Bewijs ${raak.id}`, tot.filter((b) => b.soort === 'bericht' && idsIn(b.tekst).includes(raak.id)))
  else if (raak?.rol) toonPaneel(naamVan(raak.rol), tot.filter((b) => b.spreker === raak.rol || b.aan === raak.rol).slice(-6))
})

// ---------------------------------------------------------------- data ophalen (alleen lezen)
async function poll() {
  try {
    const [rt, rv] = await Promise.all([haal('trace.json'), haal('verdict.json')])
    if (rt.ok) {
      const nt = rt.data && Array.isArray(rt.data.beurten) ? rt.data : null
      const nv = rv.ok ? rv.data : verdict
      const sleutel = nt ? `${nt.run_id}|${nt.status}|${nt.aan_het_woord}|${nt.beurten.length}|${(nt.geschillen || []).length}|${nv?.run_id}|${JSON.stringify(nv || 0).length}` : ''
      if (sleutel !== vorigeSleutel) { vorigeSleutel = sleutel; laad(nt, nv) }
    }
  } catch (fout) { console.warn('trace nog niet leesbaar', fout) }
  setTimeout(poll, CONFIG.pollMs)
}
function laad(nt, nv) {
  const nieuweRun = !trace || !nt || nt.run_id !== trace.run_id
  const zelfdeRollen = nt && rollen.join() === (nt.raadsleden || []).join()
  trace = nt; verdict = nv
  $('leeg').hidden = !!trace
  if (!trace) { beurten = []; rollen = []; extras = []; st = leeg(); pos = 0; $('labels').innerHTML = ''; tekenHtml(); return }
  beurten = trace.beurten
  const nieuweRollen = Array.isArray(trace.raadsleden) ? trace.raadsleden : []
  if (!zelfdeRollen || nieuweRun) { rollen = nieuweRollen; portret = zaal.zetRaad(rollen); bouwLabels()
    const veilig = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rolRe = Object.fromEntries(rollen.map((r) => [r, new RegExp('\\b(' + [...new Set([naamVan(r), r, r.replace(/_/g, ' ')])].map(veilig).join('|') + ')\\b', 'i')]))
  }
  eigenaarVan = toestand(n()).goud
  const klaar = trace.status !== 'bezig'
  extras = klaar ? [...(trace.geschillen || []).map((_, i) => ({ soort: 'g', i })), ...(verdictOk() ? [{ soort: 'f', pagina: 1 }, { soort: 'f', pagina: 2 }, { soort: 'f', pagina: 3 }] : [])] : []
  if (nieuweRun) {
    zaal.camNaar('breed', null, 0)
    zet(klaar ? 0 : n(), false) // een lopende run volg je live; een afgeronde run speelt vanaf het begin
    clearTimeout(timer)
    if (gestart) { if (spelend) timer = setTimeout(tik, T.opening * 1000) } else zaal.draai = true // eerst het startscherm
  } else zet(Math.min(pos, totaal()), false)
}
tekenHtml()
poll()

if (import.meta.env?.DEV) window.__raad = { zaal, zet, staat: () => ({ pos, fase: st.fase, denker: denkerNu() }) } // alleen in de dev-server, om te debuggen
