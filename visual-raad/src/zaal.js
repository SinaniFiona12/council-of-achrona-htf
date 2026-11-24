// De raadzaal: een ronde tafel bij kaarslicht, met de Koning en de Raadsleden eromheen.
// Alles is in code gebouwd (geen modellen, geen afbeeldingen). De camera beweegt naar wie spreekt.
import * as THREE from 'three'
import gsap from 'gsap'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { CONFIG, kleurVan } from './config.js'

const R_STOEL = 3.05, TAFEL_R = 2.45, TAFEL_Y = 0.97
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const TREDEN = new THREE.DataTexture(new Uint8Array([95, 150, 205, 255]), 4, 1, THREE.RedFormat)
TREDEN.minFilter = TREDEN.magFilter = THREE.NearestFilter; TREDEN.needsUpdate = true
const std = (kleur, o = {}) => { const { roughness, metalness, ...rest } = o; return new THREE.MeshToonMaterial({ color: kleur, gradientMap: TREDEN, ...rest }) }
const licht = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }) // helderder dan 1: gloeit via bloom
const hash = (s, zout = 0) => { let x = 2166136261 ^ zout; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return ((x >>> 0) % 10000) / 10000 }

// lijnsymbolen voor de banieren (eenheidsvak, y omhoog)
const boog = (r, n = 16, van = 0, tot = Math.PI * 2, cx = 0, cy = 0) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = van + (tot - van) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] })
const GLYPH = {
  archmage: [[[-1, -0.75], [1, -0.75]], [[-0.62, -0.75], [0.12, 1], [0.62, -0.75]], [[-0.38, -0.2], [0.42, -0.2]]],
  engineer: [boog(0.38, 14), boog(0.72, 20), ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return [[0.72 * Math.cos(a), 0.72 * Math.sin(a)], [Math.cos(a), Math.sin(a)]] })],
  guardian_keeper: [[[-0.8, 0.85], [0.8, 0.85], [0.8, 0], [0, -1], [-0.8, 0], [-0.8, 0.85]], [[0, 0.85], [0, -1]], [[-0.8, 0.25], [0.8, 0.25]]],
  historian: [[[-0.7, 0.8], [0.7, 0.8], [0.7, -0.8], [-0.7, -0.8], [-0.7, 0.8]], [[-0.4, 0.35], [0.4, 0.35]], [[-0.4, 0], [0.4, 0]], [[-0.4, -0.35], [0.15, -0.35]]],
  oracle: [boog(1.25, 12, Math.PI * 0.2, Math.PI * 0.8, 0, -0.74), boog(1.25, 12, Math.PI * 1.2, Math.PI * 1.8, 0, 0.74), boog(0.34, 14)],
  beast_master: [[[0, -1], [0, -0.35]], [[0, -0.35], [-0.5, 0.15], [-0.62, 1]], [[-0.5, 0.15], [-1, 0.5]], [[0, -0.35], [0.5, 0.15], [0.62, 1]], [[0.5, 0.15], [1, 0.5]]],
  koning: [[[-0.9, -0.6], [-0.9, 0.5], [-0.45, -0.05], [0, 0.85], [0.45, -0.05], [0.9, 0.5], [0.9, -0.6], [-0.9, -0.6]]],
  _: [[[0, 1], [0.7, 0], [0, -1], [-0.7, 0], [0, 1]]],
}

const PROFIEL = {
  koning: { huid: '#e2b48c', kleed: '#1e3fae', haar: '#4a2f1b', troon: true },
  archmage: { huid: '#f0d2b2', kleed: '#5b3fd0', haar: '#efeaf8' },
  engineer: { huid: '#b97f52', kleed: '#0b74b8', haar: '#201c26' },
  guardian_keeper: { huid: '#e0b089', kleed: '#566179', haar: '#3a2a1c' },
  historian: { huid: '#f0cba8', kleed: '#8a5a2b', haar: '#bdb7ae' },
  oracle: { huid: '#d39a76', kleed: '#8f1b9c', haar: '#2a1730', ogenDicht: true },
  beast_master: { huid: '#7d4c30', kleed: '#3f6b12', haar: '#241a12' },
}

function canvasTextuur(b, h, teken) {
  const c = document.createElement('canvas'); c.width = b; c.height = h
  teken(c.getContext('2d'), b, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Eén persoon aan tafel, opgebouwd uit eenvoudige vormen. Kijkt langs +z (naar het midden van de tafel). */
function maakFiguur(rol, kleurHex) {
  const P = PROFIEL[rol] || { huid: '#dcae88', kleed: kleurHex, haar: '#2b2230', kap: true }
  const g = new THREE.Group()
  const stof = std(P.kleed), stofD = std(P.kleed, { side: THREE.DoubleSide }), huid = std(P.huid, { roughness: 0.6 })
  const haar = std(P.haar, { roughness: 0.95, side: THREE.DoubleSide }), donker = std('#140f18', { roughness: 0.4 })
  const goud = std('#d9a441', { metalness: 0.85, roughness: 0.3, emissive: '#3a2600', side: THREE.DoubleSide })
  const voeg = (ouder, geo, mat, x, y, z, schaduw = true) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = schaduw; o.receiveShadow = schaduw; o.userData.rol = rol; ouder.add(o); return o
  }
  // stoel (de Koning zit op een troon)
  const hoog = P.troon ? 2.75 : 2.0
  voeg(g, new THREE.BoxGeometry(P.troon ? 0.98 : 0.8, hoog, 0.1), std('#4a2f1c'), 0, hoog / 2, -0.46)
  if (P.troon) for (const s of [-1, 1]) voeg(g, new THREE.ConeGeometry(0.07, 0.32, 8), goud, s * 0.43, hoog + 0.16, -0.46)
  // romp, schouders, armen op tafel
  voeg(g, new THREE.CylinderGeometry(0.25, 0.42, 0.95, 20), stof, 0, 0.83, 0)
  voeg(g, new THREE.SphereGeometry(0.3, 20, 14), stof, 0, 1.27, 0).scale.set(1.28, 0.44, 0.8)
  for (const s of [-1, 1]) {
    voeg(g, new THREE.CapsuleGeometry(0.075, 0.5, 4, 10), stof, s * 0.34, 1.1, 0.33).rotation.set(1.22, 0, s * -0.3)
    voeg(g, new THREE.SphereGeometry(0.062, 12, 10), huid, s * 0.25, 1.03, 0.66)
  }
  voeg(g, new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), huid, 0, 1.4, 0)
  // hoofd
  const hoofd = new THREE.Group(); hoofd.position.set(0, 1.6, 0); hoofd.scale.setScalar(1.28); g.add(hoofd)
  voeg(hoofd, new THREE.SphereGeometry(0.185, 28, 20), huid, 0, 0, 0).scale.set(0.95, 1.12, 1)
  for (const s of [-1, 1]) {
    voeg(hoofd, new THREE.SphereGeometry(0.04, 10, 8), huid, s * 0.175, -0.01, 0, false)
    if (P.ogenDicht) voeg(hoofd, new THREE.BoxGeometry(0.055, 0.009, 0.01), donker, s * 0.068, 0.02, 0.172, false)
    else voeg(hoofd, new THREE.SphereGeometry(0.03, 10, 8), donker, s * 0.068, 0.02, 0.162, false)
    voeg(hoofd, new THREE.BoxGeometry(0.07, 0.014, 0.02), haar, s * 0.068, 0.075, 0.168, false).rotation.z = s * -0.12
  }
  voeg(hoofd, new THREE.SphereGeometry(0.028, 10, 8), huid, 0, -0.03, 0.182, false).scale.set(0.8, 1.2, 1)
  voeg(hoofd, new THREE.BoxGeometry(0.065, 0.009, 0.01), donker, 0, -0.1, 0.165, false)
  const kap = (mat, r = 0.197, tot = 0.55, kantel = -0.28) => {
    const o = voeg(hoofd, new THREE.SphereGeometry(r, 26, 16, 0, Math.PI * 2, 0, Math.PI * tot), mat, 0, 0.012, -0.004)
    o.scale.set(0.97, 1.13, 1.02); o.rotation.x = kantel; return o
  }
  const ring = (ouder, r, buis, mat, x, y, z) => voeg(ouder, new THREE.TorusGeometry(r, buis, 8, 24), mat, x, y, z, false)
  const tafelY = TAFEL_Y + 0.02
  let zweef = null

  if (rol === 'koning') {
    kap(haar)
    voeg(hoofd, new THREE.SphereGeometry(0.15, 18, 14), haar, 0, -0.13, 0.06).scale.set(1.05, 0.85, 0.75)
    voeg(hoofd, new THREE.CylinderGeometry(0.17, 0.155, 0.09, 24, 1, true), goud, 0, 0.2, 0)
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; voeg(hoofd, new THREE.ConeGeometry(0.032, 0.1, 6), goud, Math.sin(a) * 0.165, 0.29, Math.cos(a) * 0.165) }
    voeg(hoofd, new THREE.SphereGeometry(0.022, 10, 8), licht(0.5, 1.2, 3.2), 0, 0.2, 0.172, false)
    const kraag = voeg(g, new THREE.TorusGeometry(0.3, 0.075, 10, 24), std('#b9b2a4'), 0, 1.31, 0); kraag.rotation.x = Math.PI / 2; kraag.scale.set(1.2, 0.85, 1)
  } else if (rol === 'archmage') {
    const hoed = new THREE.Group(); hoed.position.set(0, 0.15, -0.01); hoed.rotation.set(-0.12, 0, 0.07); hoofd.add(hoed)
    voeg(hoed, new THREE.CylinderGeometry(0.37, 0.37, 0.025, 28), std('#46309f'), 0, 0, 0)
    voeg(hoed, new THREE.ConeGeometry(0.2, 0.64, 24), stof, 0, 0.33, 0)
    voeg(hoed, new THREE.SphereGeometry(0.028, 10, 8), licht(3, 2, 0.6), 0, 0.14, 0.175, false)
    voeg(hoofd, new THREE.ConeGeometry(0.15, 0.5, 16), haar, 0, -0.33, 0.09).rotation.x = Math.PI + 0.12
    voeg(hoofd, new THREE.SphereGeometry(0.05, 10, 8), haar, 0, -0.085, 0.15, false).scale.set(1.7, 0.5, 0.6)
    zweef = voeg(g, new THREE.SphereGeometry(0.08, 18, 14), licht(1.6, 1.0, 3.4), 0.3, 1.24, 0.7, false)
  } else if (rol === 'engineer') {
    kap(haar)
    const messing = std('#c2913a', { metalness: 0.8, roughness: 0.35 })
    for (const s of [-1, 1]) { ring(hoofd, 0.05, 0.014, messing, s * 0.068, 0.105, 0.172); voeg(hoofd, new THREE.CircleGeometry(0.043, 16), licht(0.4, 1.3, 1.9), s * 0.068, 0.105, 0.176, false) }
    ring(hoofd, 0.19, 0.013, std('#4a2f1b'), 0, 0.1, 0).rotation.x = Math.PI / 2
    voeg(g, new THREE.BoxGeometry(0.36, 0.012, 0.25), licht(0.25, 0.95, 1.5), 0, tafelY, 0.98, false)
  } else if (rol === 'guardian_keeper') {
    const staal = std('#aab6c8', { metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide })
    kap(staal, 0.207, 0.6, -0.1)
    voeg(hoofd, new THREE.BoxGeometry(0.032, 0.17, 0.03), staal, 0, 0, 0.19)
    voeg(hoofd, new THREE.BoxGeometry(0.035, 0.1, 0.36), std('#b3202a'), 0, 0.255, -0.02)
    for (const s of [-1, 1]) voeg(g, new THREE.SphereGeometry(0.17, 16, 12), staal, s * 0.43, 1.3, 0)
    const kraag = ring(g, 0.2, 0.05, staal, 0, 1.36, 0); kraag.rotation.x = Math.PI / 2
  } else if (rol === 'historian') {
    kap(haar)
    voeg(hoofd, new THREE.SphereGeometry(0.085, 14, 12), haar, 0, 0.19, -0.1)
    for (const s of [-1, 1]) ring(hoofd, 0.054, 0.008, donker, s * 0.068, 0.02, 0.178)
    voeg(hoofd, new THREE.BoxGeometry(0.03, 0.008, 0.008), donker, 0, 0.02, 0.185, false)
    for (const s of [-1, 1]) voeg(g, new THREE.BoxGeometry(0.2, 0.02, 0.28), std('#eadfc6'), s * 0.1, tafelY + 0.02, 0.98).rotation.z = s * 0.16
  } else if (rol === 'oracle') {
    kap(stofD, 0.245, 0.7, -0.62).scale.set(1, 1.15, 1.1)
    voeg(hoofd, new THREE.OctahedronGeometry(0.03), licht(3, 2, 0.6), 0, 0.105, 0.185, false)
    zweef = voeg(g, new THREE.SphereGeometry(0.11, 22, 16), licht(2.6, 0.7, 2.8), 0, tafelY + 0.14, 0.98, false)
  } else if (rol === 'beast_master') {
    kap(haar, 0.205, 0.58, -0.3)
    const been = std('#e5d5b0', { roughness: 0.6 })
    for (const s of [-1, 1]) {
      voeg(hoofd, new THREE.CylinderGeometry(0.012, 0.022, 0.3, 8), been, s * 0.14, 0.32, -0.02).rotation.z = s * -0.5
      voeg(hoofd, new THREE.CylinderGeometry(0.008, 0.014, 0.16, 6), been, s * 0.24, 0.4, -0.02).rotation.z = s * -1.2
      voeg(hoofd, new THREE.CylinderGeometry(0.008, 0.014, 0.14, 6), been, s * 0.13, 0.43, -0.02).rotation.z = s * 0.25
      voeg(hoofd, new THREE.BoxGeometry(0.045, 0.012, 0.01), licht(1.2, 2.2, 0.4), s * 0.1, -0.04, 0.158, false)
    }
    const bont = voeg(g, new THREE.TorusGeometry(0.3, 0.09, 10, 24), std('#6b4a2c', { roughness: 1 }), 0, 1.3, 0); bont.rotation.x = Math.PI / 2; bont.scale.set(1.2, 0.85, 1)
  } else kap(stofD, 0.235, 0.68, -0.5)

  // de Kennisbron: een oplichtend boek dat opengaat als het Raadslid zijn bron leest
  const k = new THREE.Color(kleurHex)
  const bron = new THREE.Group(); bron.position.set(0, tafelY + 0.05, 0.86); bron.scale.setScalar(0.001); g.add(bron)
  for (const s of [-1, 1]) { const blad = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ color: k.clone().multiplyScalar(2.2), side: THREE.DoubleSide })); blad.rotation.set(-Math.PI / 2, s * 0.35, 0); blad.position.x = s * 0.105; bron.add(blad) }
  return { rol, groep: g, hoofd, bron, zweef, fase: Math.random() * 6, kijk: null, spreekt: false, leest: false }
}

export function maakZaal(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08
  container.appendChild(renderer.domElement)
  const NACHT = new THREE.Color('#1b1430')
  const scene = new THREE.Scene(); scene.background = NACHT; scene.fog = new THREE.FogExp2('#1b1430', 0.022)
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60)

  // ---- getekende texturen (in code, op lage resolutie)
  const ruis = (c, b, h, n, kleuren) => { for (let i = 0; i < n; i++) { c.fillStyle = kleuren[(Math.random() * kleuren.length) | 0]; c.fillRect((Math.random() * b) | 0, (Math.random() * h) | 0, 1 + ((Math.random() * 2) | 0), 1) } }
  const tegelTex = canvasTextuur(32, 32, (c, b, h) => {
    c.fillStyle = '#231a33'; c.fillRect(0, 0, b, h)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { c.fillStyle = (x + y) % 2 ? '#4a3d63' : '#3f3357'; c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14) }
    ruis(c, b, h, 60, ['#55476f', '#372c4c', '#2e2440'])
  }); tegelTex.repeat.set(13, 13)
  const steenTex = canvasTextuur(32, 16, (c, b, h) => {
    c.fillStyle = '#241b34'; c.fillRect(0, 0, b, h)
    for (let rij = 0; rij < 2; rij++) for (let k = -1; k < 2; k++) { c.fillStyle = ['#51446b', '#473b60', '#5a4c75'][(k + rij + 3) % 3]; c.fillRect(k * 16 + rij * 8 + 1, rij * 8 + 1, 14, 6) }
    ruis(c, b, h, 26, ['#63557f', '#3d3154'])
  }); steenTex.repeat.set(34, 9)
  const houtTex = canvasTextuur(96, 96, (c, b, h) => {
    c.fillStyle = '#6b4424'; c.fillRect(0, 0, b, h)
    for (let r = 46; r > 2; r -= 4) { c.strokeStyle = (r / 4) % 2 ? '#7c5230' : '#5a381d'; c.lineWidth = 2; c.beginPath(); c.arc(b / 2, h / 2, r, 0, Math.PI * 2); c.stroke() }
    c.strokeStyle = '#3d2412'; c.lineWidth = 1; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(b / 2, h / 2); c.lineTo(b / 2 + Math.cos(a) * 48, h / 2 + Math.sin(a) * 48); c.stroke() }
    ruis(c, b, h, 150, ['#86593a', '#4d2f17'])
  })
  const toon = (o) => new THREE.MeshToonMaterial({ gradientMap: TREDEN, ...o })

  // ---- de zaal
  const vloer = new THREE.Mesh(new THREE.CircleGeometry(12, 48), toon({ map: tegelTex })); vloer.rotation.x = -Math.PI / 2; vloer.receiveShadow = true; scene.add(vloer)
  const kleed = new THREE.Mesh(new THREE.RingGeometry(0.9, 4.7, 64), std('#7a2f5c')); kleed.rotation.x = -Math.PI / 2; kleed.position.y = 0.006; kleed.receiveShadow = true; scene.add(kleed)
  const muur = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 8, 48, 1, true), toon({ map: steenTex, side: THREE.BackSide })); muur.position.y = 4; muur.receiveShadow = true; scene.add(muur)
  const vensterTex = canvasTextuur(128, 320, (c, b, h) => {
    c.fillStyle = '#2a2040'; c.fillRect(0, 0, b, h) // de muur rond de boog (dekkend: zo krijgt het venster een strakke inktrand)
    c.beginPath(); c.moveTo(6, h); c.lineTo(6, 70); c.quadraticCurveTo(b / 2, -20, b - 6, 70); c.lineTo(b - 6, h); c.closePath(); c.clip()
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3550c0'); gr.addColorStop(1, '#7a3fb0'); c.fillStyle = gr; c.fillRect(0, 0, b, h)
    c.fillStyle = '#dfe9ff'; for (let i = 0; i < 60; i++) { c.globalAlpha = 0.3 + Math.random() * 0.7; c.fillRect(Math.random() * b, Math.random() * h, 1.6, 1.6) }
    c.globalAlpha = 1; c.strokeStyle = '#0d0915'; c.lineWidth = 4; for (const x of [b / 3, 2 * b / 3]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
    for (const y of [110, 210]) { c.beginPath(); c.moveTo(0, y); c.lineTo(b, y); c.stroke() }
  })
  for (let i = 0; i < 9; i++) {
    const a = (i + 0.5) / 9 * Math.PI * 2
    const v = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.7), new THREE.MeshBasicMaterial({ map: vensterTex }))
    v.position.set(Math.sin(a) * 8.9, 3.7, -Math.cos(a) * 8.9); v.lookAt(0, 3.7, 0); scene.add(v)
    const zuil = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 8, 12), std('#6a5b88')); const b = i / 9 * Math.PI * 2
    zuil.position.set(Math.sin(b) * 8.5, 4, -Math.cos(b) * 8.5); zuil.receiveShadow = true; scene.add(zuil)
  }

  // ---- de tafel met het sigil van Achrona
  const hout = std('#5a381d')
  const blad = new THREE.Mesh(new THREE.CylinderGeometry(TAFEL_R, TAFEL_R, 0.1, 72), [hout, toon({ map: houtTex }), hout]); blad.position.y = TAFEL_Y - 0.05; blad.castShadow = true; blad.receiveShadow = true; scene.add(blad)
  const rand = new THREE.Mesh(new THREE.TorusGeometry(TAFEL_R, 0.035, 8, 72), std('#c79a3c')); rand.rotation.x = Math.PI / 2; rand.position.y = TAFEL_Y; scene.add(rand)
  const poot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 0.9, 20), std('#24170d')); poot.position.y = 0.45; scene.add(poot)
  const sigilMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 2.6), transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  const plat = (geo, mat, y = TAFEL_Y + 0.004) => { const o = new THREE.Mesh(geo, mat); o.rotation.x = -Math.PI / 2; o.position.y = y; scene.add(o); return o }
  plat(new THREE.RingGeometry(1.02, 1.05, 72), sigilMat); plat(new THREE.RingGeometry(0.2, 0.25, 32), sigilMat)
  for (let i = 0; i < 6; i++) { const s = plat(new THREE.PlaneGeometry(0.02, 0.7), sigilMat); s.rotation.z = i * Math.PI / 3; s.position.set(Math.sin(i * Math.PI / 3) * -0.62, TAFEL_Y + 0.004, Math.cos(i * Math.PI / 3) * -0.62) }
  plat(new THREE.RingGeometry(2.2, 2.215, 72), new THREE.MeshBasicMaterial({ color: '#8a6a2f', side: THREE.DoubleSide }))

  // ---- tien kaarsen: het Beurtenbudget
  const gloedTex = canvasTextuur(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,200,120,1)'); g.addColorStop(0.3, 'rgba(255,150,60,.35)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64) })
  const kaarsen = []
  for (let i = 0; i < CONFIG.budget; i++) {
    const a = i / CONFIG.budget * Math.PI * 2, h = 0.2 + hash('k' + i) * 0.16, x = Math.sin(a) * 0.62, z = Math.cos(a) * 0.62
    const was = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, h, 12), std('#e9dfc8', { emissive: '#3a2a10', roughness: 0.6 })); was.position.set(x, TAFEL_Y + h / 2, z); was.castShadow = true; scene.add(was)
    const vlam = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 6), licht(2.6, 1.7, 0.5)); vlam.scale.set(1, 1, 1); vlam.position.set(x, TAFEL_Y + h + 0.06, z); scene.add(vlam)
    const gloed = { material: {} } // geen zachte gloed: de vlam zelf is het licht
    kaarsen.push({ vlam, gloed, aan: 1, fase: hash('f' + i) * 6 })
  }

  // ---- licht
  const hemel = new THREE.HemisphereLight('#9a90e0', '#4a3a58', 1.5); scene.add(hemel)
  const kaarslicht = new THREE.PointLight('#ffb463', 30, 20, 1.7); kaarslicht.position.set(0, 1.6, 0); kaarslicht.castShadow = true
  kaarslicht.shadow.mapSize.set(1024, 1024); kaarslicht.shadow.bias = -0.004; kaarslicht.shadow.radius = 4; scene.add(kaarslicht)
  const maan = new THREE.DirectionalLight('#6f7dff', 0.35); maan.position.set(-5, 8, 6); scene.add(maan)
  const spot = new THREE.SpotLight('#ffe6c4', 0, 14, 0.42, 0.75, 1.4); spot.position.set(0, 6, 0); scene.add(spot); scene.add(spot.target)
  const koningslicht = new THREE.PointLight('#3b6cff', 3.5, 7, 1.6); scene.add(koningslicht)
  const desync = new THREE.PointLight('#a855f7', 3, 6, 1.8); desync.position.set(0, TAFEL_Y + 0.3, 0); scene.add(desync)
  const portretlicht = new THREE.DirectionalLight('#fff1dd', 0); scene.add(portretlicht); scene.add(portretlicht.target)

  // ---- routering: een lichtstraal over de tafel, van de Koning naar het gekozen Raadslid
  const straalGeo = new THREE.BoxGeometry(1, 0.012, 0.035); straalGeo.translate(0.5, 0, 0)
  const straalAs = new THREE.Group(); straalAs.add(new THREE.Mesh(straalGeo, licht(0.6, 1.5, 4))); straalAs.visible = false; scene.add(straalAs)
  const straalKop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), licht(1.2, 2.2, 5)); straalKop.visible = false; scene.add(straalKop)

  // ---- post
  const composer = new EffectComposer(renderer)
  const pixelGrootte = Math.max(2, Math.round(CONFIG.pixel * renderer.getPixelRatio()))
  const pixelPass = new RenderPixelatedPass(pixelGrootte, scene, camera, { normalEdgeStrength: 0.75, depthEdgeStrength: 0.92 })
  { // de lijnen binnen een vorm worden ook donker (inkt), niet licht
    const mat = pixelPass.pixelatedMaterial || pixelPass._pixelatedMaterial
    if (mat) { mat.fragmentShader = mat.fragmentShader.replace('(1.0 + normalEdgeStrength * nei)', '(1.0 - normalEdgeStrength * nei)'); mat.needsUpdate = true }
  }
  composer.addPass(pixelPass)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 1.05); composer.addPass(bloom)
  composer.addPass(new OutputPass())
  // papier en raster: weinig tinten per kleur, met een rasterpatroon ertussen en de korrel van papier eroverheen
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uPixel: { value: pixelGrootte }, uNiveaus: { value: CONFIG.kleurNiveaus } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uPixel; uniform float uNiveaus; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float bayer(vec2 p) { int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
        float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); return m[x + y * 4] / 16.0 - 0.47; }
      void main() {
        vec3 k = texture2D(tDiffuse, vUv).rgb;
        vec2 cel = floor(gl_FragCoord.xy / uPixel);
        float was = 0.9 + 0.18 * n(cel / 26.0);  // vlekkerige kleurwassing
        k *= was;
        k = mix(k, k * vec3(1.06, 0.99, 0.88), 0.55);                   // warm papier
        k += bayer(cel) * 0.38 / uNiveaus;                              // raster
        k = floor(k * uNiveaus + 0.5) / uNiveaus;                       // weinig tinten
        k *= 0.97 + 0.045 * h(cel);                                      // papierkorrel
        gl_FragColor = vec4(k, 1.0);
      }`,
  }))

  // ---- toestand
  const banierVorm = new THREE.Shape([[-0.575, 1.6], [0.575, 1.6], [0.575, -1.09], [0, -1.6], [-0.575, -1.09]].map(([x, y]) => new THREE.Vector2(x, y)))
  const banierGeo = new THREE.ShapeGeometry(banierVorm)
  for (let i = 0, p = banierGeo.attributes.position, uv = banierGeo.attributes.uv; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.15 + 0.5, p.getY(i) / 3.2 + 0.5)
  const figuren = new Map(), plekken = new Map(), banieren = []
  const papieren = new Map(), papierGeo = new THREE.PlaneGeometry(0.19, 0.13)
  const cam = { x: 0, y: 5.4, z: 9, tx: 0, ty: 0.6, tz: 0 }
  let camSleutel = '', lite = false, herstel = 0, geschil = null, geschilMesh = null, finale = null, focus = null
  const sigilKleur = new THREE.Color(), PAARS = new THREE.Color(1.5, 0.5, 2.6), TEAL = new THREE.Color(0.5, 2.0, 1.8), GOUD = new THREE.Color(3, 1.9, 0.6)
  const api = { opFrame: null }

  const hoofdPlek = (rol) => { const p = plekken.get(rol); return p ? V(p.pos.x, 1.58, p.pos.z) : V(0, 1.4, 0) }
  const opTafel = (rol, r) => { const p = plekken.get(rol); return p ? V(p.dir.x * r, TAFEL_Y + 0.03, p.dir.z * r) : V(0, TAFEL_Y + 0.03, 0) }

  function ruimOp(o) { scene.remove(o); o.traverse?.((x) => { if (x.geometry !== banierGeo) x.geometry?.dispose?.() }) }

  /** Bouwt de Koning en de Raadsleden rond de tafel en geeft een portret (data-URL) per Rol terug. */
  api.zetRaad = (rollen) => {
    for (const f of figuren.values()) ruimOp(f.groep)
    for (const b of banieren) ruimOp(b)
    figuren.clear(); plekken.clear(); banieren.length = 0
    const alle = ['koning', ...rollen]
    alle.forEach((rol, i) => {
      const hoek = i === 0 ? 0 : (i / (rollen.length + 1)) * Math.PI * 2 // de Koning zit achteraan, de rest verdeelt zich rond de tafel
      const dir = V(Math.sin(hoek), 0, -Math.cos(hoek)), pos = dir.clone().multiplyScalar(R_STOEL)
      plekken.set(rol, { hoek, dir, pos })
      const kleur = kleurVan(rol, i - 1)
      const f = maakFiguur(rol, kleur); f.groep.position.copy(pos); f.groep.lookAt(0, 0, 0); scene.add(f.groep); figuren.set(rol, f)
      // banier in de kleur van de Rol, met zijn symbool, aan de muur achter zijn stoel
      const tex = canvasTextuur(160, 440, (c, b, h) => {
        c.beginPath(); c.moveTo(0, 0); c.lineTo(b, 0); c.lineTo(b, h - 70); c.lineTo(b / 2, h); c.lineTo(0, h - 70); c.closePath(); c.clip()
        c.fillStyle = kleur; c.fillRect(0, 0, b, h); c.fillStyle = 'rgba(10,6,16,.2)'; c.fillRect(0, 0, b, h)
        c.strokeStyle = '#e3b04b'; c.lineWidth = 6; c.strokeRect(9, 9, b - 18, h); c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round'
        for (const lijn of GLYPH[rol] || GLYPH._) { c.beginPath(); lijn.forEach(([x, y], j) => c[j ? 'lineTo' : 'moveTo'](b / 2 + x * 48, 170 - y * 48)); c.stroke() }
      })
      const banier = new THREE.Mesh(banierGeo, toon({ map: tex, side: THREE.DoubleSide }))
      banier.position.set(dir.x * 8.55, 4.3, dir.z * 8.55); banier.lookAt(0, 4.3, 0); scene.add(banier); banieren.push(banier)
    })
    const k = plekken.get('koning'); koningslicht.position.set(k.pos.x * 1.25, 3.2, k.pos.z * 1.25)
    return portretten()
  }

  /** Portret per Rol: een momentopname van het eigen 3D-personage (dus geen losse afbeeldingen). */
  function portretten() {
    const uit = {}, c = document.createElement('canvas'); c.width = c.height = 72
    const ctx = c.getContext('2d'), pc = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
    const mist = scene.fog, pr = renderer.getPixelRatio()
    scene.fog = null; renderer.setPixelRatio(1); renderer.setSize(72, 72, false); portretlicht.intensity = 2.2; hemel.intensity = 1.9
    for (const [rol, f] of figuren) {
      const p = plekken.get(rol), hoofd = V(p.pos.x, 1.62, p.pos.z)
      pc.position.copy(hoofd).addScaledVector(p.dir, -1.75).add(V(0, 0.08, 0)); pc.lookAt(hoofd)
      portretlicht.position.copy(pc.position).add(V(0.6, 0.9, 0)); portretlicht.target.position.copy(hoofd)
      scene.background = new THREE.Color(kleurVan(rol, 0)).multiplyScalar(0.3)
      f.hoofd.rotation.set(0, 0, 0); scene.updateMatrixWorld(true)
      renderer.render(scene, pc); ctx.clearRect(0, 0, 72, 72); ctx.drawImage(renderer.domElement, 0, 0, 72, 72)
      uit[rol] = c.toDataURL('image/png')
    }
    scene.fog = mist; scene.background = NACHT; portretlicht.intensity = 0; hemel.intensity = 1.5; renderer.setPixelRatio(pr); resize()
    return uit
  }

  /** Wie spreekt of leest, en naar wie hij kijkt. Alle anderen kijken naar de spreker. */
  api.zetFocus = (rol, { leest = false, naar = null } = {}) => {
    focus = rol && figuren.has(rol) ? rol : null
    for (const f of figuren.values()) {
      const ik = f.rol === focus
      f.spreekt = ik && !leest; f.leest = ik && leest
      f.kijk = ik ? (naar && figuren.has(naar) ? hoofdPlek(naar) : null) : focus ? hoofdPlek(focus) : null
      gsap.to(f.bron.scale, { x: f.leest ? 1 : 0.001, y: f.leest ? 1 : 0.001, z: f.leest ? 1 : 0.001, duration: 0.4, overwrite: true })
    }
    if (focus) { const p = plekken.get(focus); spot.position.set(p.dir.x * 1.2, 6, p.dir.z * 1.2); spot.target.position.copy(hoofdPlek(focus)) }
    gsap.to(spot, { intensity: focus ? 30 : 0, duration: 0.7, overwrite: true })
  }

  api.straal = (rol, animeer, snel = 1) => {
    gsap.killTweensOf(straalAs.scale); gsap.killTweensOf(straalKop.position)
    if (!rol || !plekken.has(rol)) { straalAs.visible = false; straalKop.visible = false; return }
    const a = opTafel('koning', 2.15), b = opTafel(rol, 2.15), len = a.distanceTo(b)
    straalAs.position.copy(a); straalAs.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x); straalAs.visible = true
    if (animeer) {
      straalAs.scale.set(0.001, 1, 1); gsap.to(straalAs.scale, { x: len, duration: 0.9 / snel, ease: 'power2.out' })
      straalKop.visible = true; straalKop.position.copy(a); gsap.to(straalKop.position, { x: b.x, y: b.y, z: b.z, duration: 0.9 / snel, ease: 'power2.out', onComplete: () => { straalKop.visible = false } })
    } else { straalAs.scale.set(len, 1, 1); straalKop.visible = false }
  }

  api.zetBudget = (brandend, animeer) => kaarsen.forEach((k, i) => {
    const doel = i < brandend ? 1 : 0
    if (animeer) gsap.to(k, { aan: doel, duration: 0.8, overwrite: true }); else { gsap.killTweensOf(k); k.aan = doel }
  })

  function papierPlek(id, rol, gedeeld) {
    const p = plekken.get(rol) || plekken.get('koning')
    const a = p.hoek + (hash(id) - 0.5) * (gedeeld ? 1.0 : 0.62), r = gedeeld ? 1.12 + hash(id, 5) * 0.3 : 1.5 + hash(id, 7) * 0.62
    return V(Math.sin(a) * r, TAFEL_Y + 0.012 + hash(id, 11) * 0.02, -Math.cos(a) * r)
  }
  /** Het bewijs op tafel: één blad per record-ID, bij het Raadslid dat het inbracht. Door een tweede Rol genoemd = schuift naar het midden. */
  api.zetPapieren = (lijst, animeer, snel = 1) => {
    const blijft = new Set(lijst.map((x) => x.id))
    for (const [id, m] of papieren) if (!blijft.has(id)) { gsap.killTweensOf(m.position); scene.remove(m); m.material.dispose(); papieren.delete(id) }
    let nieuw = 0
    for (const { id, rol, gedeeld } of lijst) {
      let m = papieren.get(id)
      const doel = papierPlek(id, rol, gedeeld)
      if (!m) {
        m = new THREE.Mesh(papierGeo, toon({ color: '#f3e8cc', emissive: '#f0a830', emissiveIntensity: 0.1, transparent: true, side: THREE.DoubleSide }))
        m.rotation.set(-Math.PI / 2, 0, hash(id, 3) * Math.PI * 2); m.userData = { id, rol, gedeeld, thuis: doel }; m.receiveShadow = true
        scene.add(m); papieren.set(id, m)
        if (animeer) {
          const van = opTafel(rol, 2.3); m.position.set(van.x, 1.45, van.z)
          gsap.to(m.position, { x: doel.x, y: doel.y, z: doel.z, duration: 0.8 / snel, delay: Math.min(nieuw++ * 0.08, 1.3) / snel, ease: 'power2.out' })
        } else m.position.copy(doel)
      } else if (m.userData.gedeeld !== gedeeld || !animeer) {
        gsap.killTweensOf(m.position)
        if (animeer) gsap.to(m.position, { x: doel.x, y: doel.y, z: doel.z, duration: 0.9 / snel, ease: 'power2.inOut' }); else m.position.copy(doel)
      }
      m.userData.gedeeld = gedeeld; m.userData.thuis = doel
      m.material.emissiveIntensity = gedeeld ? 1.1 : 0.1; m.material.opacity = 1
    }
  }

  /** Geschil: een flits tussen de betrokken Raadsleden. Beslecht = rustig goud; open = oranje en trillend. */
  api.zetGeschil = (g) => { geschil = g && g.rollen.filter((r) => plekken.has(r)).length ? g : null; if (geschilMesh) { ruimOp(geschilMesh); geschilMesh = null } }
  function tekenGeschil(t) {
    if (geschilMesh) { ruimOp(geschilMesh); geschilMesh = null }
    if (!geschil) return
    const wie = geschil.rollen.filter((r) => plekken.has(r)), a = hoofdPlek(wie[0]), b = wie[1] ? hoofdPlek(wie[1]) : V(0, TAFEL_Y + 0.4, 0)
    const pts = [], N = 14, tril = geschil.beslecht ? 0 : 0.12
    for (let i = 0; i <= N; i++) { const f = i / N, p = a.clone().lerp(b, f); p.y += Math.sin(f * Math.PI) * 0.55; if (i && i < N) p.add(V((Math.random() - 0.5) * tril, (Math.random() - 0.5) * tril, (Math.random() - 0.5) * tril)); pts.push(p) }
    const k = geschil.beslecht ? licht(3, 1.9, 0.6) : licht(3.4, 1.0, 0.35)
    if (!geschil.beslecht && Math.sin(t * 23) > 0.75) return // flikkert
    geschilMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.016, 5), k); scene.add(geschilMesh)
  }

  /** Finale: het bewijs van elk deel van de oorzaak schuift naar een eigen stapel; het sigil wordt goud. */
  api.zetFinale = (f, animeer, snel = 1) => {
    finale = f
    const centra = [V(-1.5, 0, 0.75), V(0, 0, 1.6), V(1.5, 0, 0.75)], gebruikt = new Map()
    if (f) f.forEach((ids, s) => ids.forEach((id, j) => { if (!gebruikt.has(id)) gebruikt.set(id, { s, j, n: ids.length }) }))
    for (const [id, m] of papieren) {
      const u = gebruikt.get(id)
      let doel = m.userData.thuis
      if (u) { const a = u.j / Math.max(u.n, 1) * Math.PI * 2, r = u.n === 1 ? 0 : 0.2 + 0.07 * (u.j % 2); doel = V(centra[u.s].x + Math.cos(a) * r, TAFEL_Y + 0.03 + u.j * 0.002, centra[u.s].z + Math.sin(a) * r) }
      gsap.killTweensOf(m.position)
      if (animeer) gsap.to(m.position, { x: doel.x, y: doel.y, z: doel.z, duration: 1.6 / snel, delay: u ? u.j * 0.05 : 0, ease: 'power2.inOut' }); else m.position.copy(doel)
      m.material.emissiveIntensity = f ? (u ? 1.6 : 0.03) : (m.userData.gedeeld ? 1.1 : 0.1)
      m.material.opacity = f && !u ? 0.25 : 1
    }
  }
  api.zetHerstel = (f) => { gsap.to(api, { _h: f, duration: 1.5, overwrite: true, onUpdate: () => { herstel = api._h } }) }
  api._h = 0

  // ---- camera
  const SHOTS = {
    breed: () => ({ x: 0, y: 5.4, z: 9, tx: 0, ty: 0.55, tz: 0 }),
    finale: () => ({ x: 0, y: 7.6, z: 9.2, tx: 0, ty: -1.7, tz: 0 }),
    persoon: (rol) => {
      const p = plekken.get(rol); if (!p) return SHOTS.breed()
      const zij = V(-p.dir.z, 0, p.dir.x), kant = hash(rol) > 0.5 ? 1 : -1
      const c = p.dir.clone().multiplyScalar(-1.9).addScaledVector(zij, 1.7 * kant)
      return { x: c.x, y: 2.5, z: c.z, tx: p.pos.x * 0.9, ty: 0.85, tz: p.pos.z * 0.9 }
    },
    duo: (rollen) => {
      const wie = rollen.filter((r) => plekken.has(r)); if (!wie.length) return SHOTS.breed()
      if (wie.length === 1) return SHOTS.persoon(wie[0])
      const m = V(0, 0, 0); wie.forEach((r) => m.add(plekken.get(r).pos)); m.multiplyScalar(1 / wie.length)
      if (m.length() < 0.6) return SHOTS.breed()
      const d = m.clone().normalize()
      return { x: -d.x * 3.4, y: 3.3, z: -d.z * 3.4, tx: m.x, ty: 0.75, tz: m.z }
    },
  }
  api.camNaar = (soort, arg, duur = 1.5) => {
    const sleutel = soort + ':' + (Array.isArray(arg) ? arg.join() : arg || '')
    if (sleutel === camSleutel && duur > 0) return
    camSleutel = sleutel; api.dichtbij = soort === 'persoon'
    const doel = SHOTS[soort](arg)
    gsap.killTweensOf(cam)
    if (duur > 0) gsap.to(cam, { ...doel, duration: duur, ease: 'power2.inOut' }); else Object.assign(cam, doel)
  }

  api.project = (rol, extraY = 0.5) => {
    const p = hoofdPlek(rol); p.y += extraY; p.project(camera)
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (0.5 - p.y * 0.5) * innerHeight, zichtbaar: p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 }
  }
  const straalKiezer = new THREE.Raycaster()
  api.kies = (x, y) => {
    straalKiezer.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), camera)
    const raak = straalKiezer.intersectObjects([...papieren.values(), ...[...figuren.values()].map((f) => f.groep)], true)[0]
    if (!raak) return null
    return raak.object.userData.id ? { id: raak.object.userData.id } : raak.object.userData.rol ? { rol: raak.object.userData.rol } : null
  }
  api.setLite = (aan) => { lite = aan; renderer.shadowMap.enabled = !aan; kaarslicht.castShadow = !aan; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true }) }

  function resize() {
    const b = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight
    camera.aspect = b / h; camera.updateProjectionMatrix(); renderer.setSize(b, h); composer.setSize(b, h)
  }
  addEventListener('resize', resize); resize()

  function frame(ms) {
    requestAnimationFrame(frame)
    if (document.hidden) return
    const t = ms / 1000
    // camera: zweeft zacht, zodat het beeld nooit stilstaat
    camera.position.set(cam.x + Math.sin(t * 0.23) * 0.14, cam.y + Math.sin(t * 0.31) * 0.05, cam.z + Math.cos(t * 0.19) * 0.14)
    camera.lookAt(cam.tx, cam.ty, cam.tz)
    // kaarsen flakkeren; hoe minder er branden, hoe donkerder de zaal
    let brandt = 0
    for (const k of kaarsen) { const fl = 0.85 + 0.15 * Math.sin(t * 11 + k.fase) * Math.sin(t * 7.3 + k.fase * 2); k.vlam.scale.set(Math.max(0.001, k.aan), Math.max(0.001, k.aan * fl * 1.15), Math.max(0.001, k.aan)); k.gloed.material.opacity = k.aan * fl; brandt += k.aan }
    kaarslicht.intensity = (5.5 + 8 * brandt / kaarsen.length) * (0.94 + 0.06 * Math.sin(t * 9.1) * Math.sin(t * 5.7))
    // het sigil: paars en onrustig zolang de Desync onverklaard is, turquoise naarmate er bewijs komt, goud bij het vonnis
    if (herstel >= 0.99) sigilKleur.copy(GOUD); else sigilKleur.copy(PAARS).lerp(TEAL, herstel)
    const onrust = (1 - herstel) * (Math.random() > 0.93 ? 0.35 : 1)
    sigilMat.color.copy(sigilKleur).multiplyScalar(0.55 + 0.45 * (herstel >= 0.99 ? 1 : onrust))
    desync.color.copy(sigilKleur); desync.intensity = 0.8 + 1.2 * (herstel >= 0.99 ? 1 : onrust)
    // personages: ademen, kijken naar de spreker, knikken bij het spreken, buigen over hun bron bij het lezen
    for (const f of figuren.values()) {
      const lokaal = f.kijk ? f.groep.worldToLocal(f.kijk.clone()) : null
      const gier = lokaal ? Math.max(-1.1, Math.min(1.1, Math.atan2(lokaal.x, lokaal.z))) : Math.sin(t * 0.4 + f.fase) * 0.1
      f.hoofd.rotation.y += (gier - f.hoofd.rotation.y) * 0.07
      const knik = f.leest ? 0.42 : f.spreekt ? Math.sin(t * 8 + f.fase) * 0.04 : 0
      f.hoofd.rotation.x += (knik - f.hoofd.rotation.x) * 0.1
      f.groep.scale.y = 1 + Math.sin(t * 1.3 + f.fase) * 0.006
      if (f.zweef) f.zweef.position.y += Math.sin(t * 1.6 + f.fase) * 0.0006
      if (f.leest) f.bron.rotation.y = Math.sin(t * 2) * 0.05
    }
    tekenGeschil(t)
    api.opFrame?.(t)
    if (lite) renderer.render(scene, camera); else composer.render()
  }
  requestAnimationFrame(frame)
  api.canvas = renderer.domElement
  return api
}
