// De 3D-scène: houten tafel, open pop-upboek, kaarsen, papierfiguren, gouden draad, scheur met glitch, snippers.
// Alles wat beweegt, wordt aangestuurd vanuit main.js; deze module tekent alleen.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { gsap } from 'gsap'
import { CONFIG, kleurVan } from './config.js'

const K = CONFIG.kleuren
const PAGINA = { b: 6, d: 8, dik: 0.42 } // breedte (x), diepte (z), dikte van het paginablok
const BOVEN = 0.12 + PAGINA.dik // hoogte van het papier boven de tafel

// ------------------------------------------------------------------ canvas-texturen

function canvasTex(w, h, teken) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  teken(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function ruis(ctx, w, h, n, kleur, max = 3) {
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = kleur
    ctx.globalAlpha = Math.random() * 0.12
    ctx.beginPath()
    const x = Math.random() * w, y = Math.random() * h
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 18 * max, y + (Math.random() - 0.5) * 18 * max)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

const papierTex = (links) => canvasTex(768, 1024, (ctx, w, h) => {
  ctx.fillStyle = K.papier
  ctx.fillRect(0, 0, w, h)
  ruis(ctx, w, h, 2600, '#8a6a3a', 1)
  const g = ctx.createLinearGradient(links ? w : 0, 0, links ? 0 : w, 0) // donkerder naar de rug toe
  g.addColorStop(0, 'rgba(90,60,25,0.35)'); g.addColorStop(0.12, 'rgba(90,60,25,0)'); g.addColorStop(1, 'rgba(90,60,25,0.08)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(126,34,206,0.10)' // circuitlijnen in de marge: magie + technologie
  ctx.lineWidth = 2
  for (let i = 0; i < 7; i++) {
    const y = 70 + i * 135, x0 = links ? 40 : w - 40
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0, y + 60); ctx.lineTo(x0 + (links ? 40 : -40), y + 90); ctx.stroke()
    ctx.beginPath(); ctx.arc(x0 + (links ? 40 : -40), y + 90, 5, 0, 7); ctx.stroke()
  }
})

const houtTex = () => {
  const t = canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3a2416'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 25},${30 + Math.random() * 15},${0.25 + Math.random() * 0.25})`
      ctx.fillRect(0, y + Math.sin(y * 0.05) * 3, w, 1 + Math.random() * 2)
    }
    ruis(ctx, w, h, 900, '#1a0e06', 4)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

const muurTex = () => canvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3d2f4d'
  ctx.fillRect(0, 0, w, h)
  ruis(ctx, w, h, 1500, '#0d0812', 3)
  ruis(ctx, w, h, 600, '#3a2c4a', 2)
})

const vlamTex = () => canvasTex(64, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.5)
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.95)')
  g.addColorStop(0.6, 'rgba(232,110,30,0.45)'); g.addColorStop(1, 'rgba(232,86,42,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.46, 0, 0, Math.PI * 2); ctx.fill()
})

const gloedTex = (kleur) => canvasTex(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
  g.addColorStop(0, kleur); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
})

export function snipperTex(id) {
  return canvasTex(256, 96, (ctx, w, h) => {
    ctx.fillStyle = K.goud
    ctx.beginPath() // gescheurde snipper
    ctx.moveTo(6, 10); ctx.lineTo(w - 14, 4); ctx.lineTo(w - 4, h / 2); ctx.lineTo(w - 12, h - 6); ctx.lineTo(10, h - 10); ctx.lineTo(2, h / 2)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#fff2c4'; ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = '#2a1b0c'
    ctx.font = 'bold 44px Georgia, serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(id, w / 2, h / 2 + 2)
  })
}

/** SVG-avatar → uitgeknipte papierfiguur (witte papierrand) als texture. */
async function figuurTex(src, kleur, letter) {
  const W = 400, H = 560, rand = 12
  let img = null
  try {
    img = new Image()
    img.src = src
    await img.decode()
  } catch { img = null }
  return canvasTex(W + rand * 2, H + rand * 2, (ctx, w, h) => {
    const teken = (c) => {
      if (img) c.drawImage(img, rand, rand, W, H)
      else { // geen SVG: gekleurde figuur met initiaal
        c.fillStyle = kleur
        c.beginPath(); c.arc(w / 2, h * 0.28, W * 0.17, 0, 7); c.fill()
        c.fillRect(w * 0.25, h * 0.45, w * 0.5, h * 0.5)
        c.fillStyle = K.ijs; c.font = 'bold 90px Georgia'; c.textAlign = 'center'; c.fillText(letter, w / 2, h * 0.85)
      }
    }
    // witte papierrand: de figuur in wit, rondom verschoven
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
    const t = tmp.getContext('2d')
    teken(t)
    t.globalCompositeOperation = 'source-in'; t.fillStyle = '#fbf6ea'; t.fillRect(0, 0, w, h)
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) ctx.drawImage(tmp, Math.cos(a) * rand * 0.8, Math.sin(a) * rand * 0.8)
    teken(ctx)
  })
}

// ------------------------------------------------------------------ de wereld

export async function maakWereld(container, leden) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.licht.pixelRatioMax))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = CONFIG.licht.belichting
  container.append(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0a0710')
  scene.fog = new THREE.FogExp2('#150F1F', 0.028)

  const camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.1, 100)
  const camBasis = new THREE.Vector3(0, 8.6, 13.2)
  const kijkBasis = new THREE.Vector3(0, 2.0, -2.2)
  camera.position.copy(camBasis)

  // licht: zwak omgevingslicht, een warm toplicht, en één schaduwlicht voor het schaduwtheater op de muur
  scene.add(new THREE.HemisphereLight('#6a5a8a', '#1a0e06', 0.55))
  const top = new THREE.DirectionalLight('#ffd9a8', 0.9)
  top.position.set(-2, 10, 4)
  scene.add(top)
  const schaduwLicht = new THREE.SpotLight('#ffe2b0', 28, 40, 0.5, 0.7, 1.4)
  schaduwLicht.position.set(1.5, 1.2, 8)
  schaduwLicht.castShadow = true
  schaduwLicht.shadow.mapSize.set(CONFIG.licht.schaduwMap, CONFIG.licht.schaduwMap)
  schaduwLicht.shadow.bias = -0.0015
  scene.add(schaduwLicht, schaduwLicht.target)
  const kaarsLicht = [new THREE.PointLight('#ffb35c', 6, 16, 1.6), new THREE.PointLight('#ffb35c', 6, 16, 1.6)]
  kaarsLicht[0].position.set(-3.5, 2.4, -3.8); kaarsLicht[1].position.set(3.5, 2.4, -3.8)
  scene.add(...kaarsLicht)
  const muurLicht = new THREE.SpotLight('#c9a6ff', 55, 30, 0.7, 0.9, 1.2) // zacht licht op de muur voor het schaduwtheater
  muurLicht.position.set(0, 10, 3)
  muurLicht.target.position.set(0, 6, -9.5)
  scene.add(muurLicht, muurLicht.target)
  const koningLicht = new THREE.PointLight(K.koning, 0, 8, 1.5)
  koningLicht.position.set(-3.2, 3, 0.5)
  scene.add(koningLicht)

  // tafel en muur
  const tafel = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 22), new THREE.MeshStandardMaterial({ map: houtTex(), roughness: 0.8 }))
  tafel.position.set(0, -0.3, -1)
  tafel.receiveShadow = true
  const muur = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshStandardMaterial({ map: muurTex(), roughness: 1 }))
  muur.position.set(0, 8, -9.5)
  muur.receiveShadow = true
  scene.add(tafel, muur)

  // ---------------- het boek: links (Koning) en rechts (spreker), stijve pagina's die om de rug scharnieren
  const leer = new THREE.MeshStandardMaterial({ color: '#3b1d2e', roughness: 0.6, metalness: 0.1 })
  const rand = new THREE.MeshStandardMaterial({ color: '#d9caa6', roughness: 0.9 })
  const boek = new THREE.Group()
  scene.add(boek)
  const maakHelft = (links) => {
    const g = new THREE.Group()
    const kaft = new THREE.Mesh(new THREE.BoxGeometry(PAGINA.b + 0.35, 0.12, PAGINA.d + 0.5), leer)
    kaft.position.set((links ? -1 : 1) * (PAGINA.b / 2 + 0.12), 0.06, 0)
    kaft.castShadow = true; kaft.receiveShadow = true
    const blokMat = [rand, rand, new THREE.MeshStandardMaterial({ map: papierTex(links), roughness: 0.92 }), rand, rand, rand]
    const blok = new THREE.Mesh(new THREE.BoxGeometry(PAGINA.b, PAGINA.dik, PAGINA.d), blokMat)
    blok.position.set((links ? -1 : 1) * (PAGINA.b / 2 + 0.05), 0.12 + PAGINA.dik / 2, 0)
    blok.receiveShadow = true; blok.castShadow = true
    g.add(kaft, blok)
    return g
  }
  const links = maakHelft(true)
  const rechts = maakHelft(false)
  const klap = { a: 0 } // hoek van de rechterhelft rond de rug (0 = open, ~PI = dicht)
  const zetKlap = () => {
    rechts.rotation.z = klap.a
    rechts.position.set(BOVEN * Math.sin(klap.a), BOVEN * (1 - Math.cos(klap.a)), 0)
  }
  boek.add(links, rechts)
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, PAGINA.d + 0.5, 16, 1, false, Math.PI, Math.PI), leer)
  rug.rotation.x = Math.PI / 2
  rug.position.y = 0.1
  boek.add(rug)

  // een losse, stijve pagina die kan omslaan (bij elke nieuwe spreker)
  const losPagina = new THREE.Group()
  const losMesh = new THREE.Mesh(new THREE.BoxGeometry(PAGINA.b, 0.02, PAGINA.d), [rand, rand, new THREE.MeshStandardMaterial({ map: papierTex(false), roughness: 0.92 }), new THREE.MeshStandardMaterial({ map: papierTex(true), roughness: 0.92 }), rand, rand])
  losMesh.position.x = PAGINA.b / 2 + 0.05
  losMesh.castShadow = true
  losPagina.add(losMesh)
  losPagina.position.y = BOVEN + 0.01
  losPagina.visible = false
  boek.add(losPagina)

  // hoofdstuk-tabs aan de bovenrand: INGREEP / MECHANISME / VERLOOP
  const tabs = ['INGREEP', 'MECHANISME', 'VERLOOP'].map((naam, i) => {
    const tex = canvasTex(256, 80, (ctx, w, h) => {
      ctx.fillStyle = '#2a2036'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#cbb79a'; ctx.font = 'bold 30px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(naam, w / 2, h / 2 + 2)
    })
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: new THREE.Color('#000000') })
    const tab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.7), mat)
    tab.position.set(-3.6 + i * 3.6, BOVEN + 0.02, -PAGINA.d / 2 - 0.22)
    boek.add(tab)
    return tab
  })

  // ---------------- kaarsen (= het Beurtenbudget) in een boog achter het boek
  const vlamMat = new THREE.SpriteMaterial({ map: vlamTex(), color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const gloedMat = new THREE.SpriteMaterial({ map: gloedTex('rgba(255,170,80,0.55)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const kaarsen = []
  for (let i = 0; i < CONFIG.kaarsen; i++) {
    const a = Math.PI + 0.32 + (i / (CONFIG.kaarsen - 1)) * (Math.PI - 0.64)
    const hoogte = 1.1 + ((i * 37) % 7) / 10
    const x = 8.2 * Math.cos(a), z = -2.2 + 4.6 * Math.sin(a)
    const was = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, hoogte, 16), new THREE.MeshStandardMaterial({ color: K.was, roughness: 0.55, emissive: '#3a2008', emissiveIntensity: 0.4 }))
    was.position.set(x, hoogte / 2, z)
    was.castShadow = true
    const vlam = new THREE.Sprite(vlamMat.clone())
    vlam.scale.set(0.32, 0.62, 1)
    vlam.position.set(x, hoogte + 0.32, z)
    const gloed = new THREE.Sprite(gloedMat.clone())
    gloed.scale.set(2.2, 2.2, 1)
    gloed.position.copy(vlam.position)
    scene.add(was, vlam, gloed)
    kaarsen.push({ was, vlam, gloed, aan: false, fase: Math.random() * 10 })
  }

  // ---------------- stof in het licht
  const stofN = 260
  const stofGeo = new THREE.BufferGeometry()
  const stofPos = new Float32Array(stofN * 3)
  for (let i = 0; i < stofN; i++) { stofPos[i * 3] = (Math.random() - 0.5) * 22; stofPos[i * 3 + 1] = Math.random() * 9; stofPos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2 }
  stofGeo.setAttribute('position', new THREE.BufferAttribute(stofPos, 3))
  const stof = new THREE.Points(stofGeo, new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(stof)

  // ---------------- de scheur (de Desync) met gouden naad (kintsugi) en glitch-pixels
  const N = CONFIG.naadSegmenten
  const scheurPunten = []
  for (let i = 0; i <= N; i++) {
    const x = -PAGINA.b + 0.5 + (i / N) * (PAGINA.b * 2 - 1)
    scheurPunten.push(new THREE.Vector3(x, BOVEN + 0.012, 1.7 + Math.sin(i * 1.7) * 0.25 + ((i * 53) % 7 - 3) * 0.06))
  }
  const segmenten = []
  const scheurMat = new THREE.MeshBasicMaterial({ color: K.paars2, transparent: true, opacity: 0.95 })
  const naadMat = new THREE.MeshStandardMaterial({ color: K.goud, emissive: K.goud, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.8 })
  const pixelGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11)
  const pixelMat = new THREE.MeshBasicMaterial({ color: K.paars2 })
  const P = CONFIG.pixelsPerSegment
  const pixels = new THREE.InstancedMesh(pixelGeo, pixelMat, N * P)
  const pixelData = []
  const dummy = new THREE.Object3D()
  for (let i = 0; i < N; i++) {
    const a = scheurPunten[i], b = scheurPunten[i + 1]
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const lengte = a.distanceTo(b)
    const hoek = Math.atan2(b.z - a.z, b.x - a.x)
    const scheur = new THREE.Mesh(new THREE.BoxGeometry(lengte + 0.02, 0.01, 0.13), scheurMat)
    scheur.position.copy(mid); scheur.rotation.y = -hoek
    const naad = new THREE.Mesh(new THREE.BoxGeometry(lengte + 0.03, 0.03, 0.09), naadMat)
    naad.position.copy(mid).add(new THREE.Vector3(0, 0.012, 0)); naad.rotation.y = -hoek
    naad.scale.x = 0.001; naad.visible = false
    boek.add(scheur, naad)
    segmenten.push({ mid, scheur, naad, heel: false, pixelsZicht: 1 })
    for (let k = 0; k < P; k++) {
      pixelData.push({ seg: i, x: mid.x + (Math.random() - 0.5) * lengte * 1.4, z: mid.z + (Math.random() - 0.5) * 0.9, y: BOVEN + 0.08 + Math.random() * 0.5, f: Math.random() * 10 })
    }
  }
  scene.add(pixels)

  // ---------------- papierfiguren
  const figuren = {}
  const maakFiguur = async (rol, i, koning = false) => {
    const kleur = koning ? K.koning : kleurVan(rol, i)
    const tex = await figuurTex(`/avatars/${rol}.svg`, kleur, (rol[0] || '?').toUpperCase())
    const hoogte = koning ? 3.2 : 3.4, breedte = hoogte * (424 / 584)
    const geo = new THREE.PlaneGeometry(breedte, hoogte)
    geo.translate(0, hoogte / 2, 0)
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, emissive: new THREE.Color(kleur), emissiveIntensity: 0 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 })
    const scharnier = new THREE.Group() // draait om de onderrand: plat = op de pagina, 0 = rechtop
    scharnier.add(mesh)
    scharnier.userData = { rol, kleur }
    mesh.userData = { rol }
    boek.add(scharnier)
    figuren[rol] = { scharnier, mesh, mat, kleur, hoogte }
    return figuren[rol]
  }
  const koning = await maakFiguur('koning', 0, true)
  koning.scharnier.position.set(-3.4, BOVEN, -0.9)
  koning.scharnier.rotation.x = -Math.PI / 2 + 0.02 // start plat (de opening zet hem recht)

  const rustPlaats = (i, n) => new THREE.Vector3(0.9 + (n > 1 ? (i / (n - 1)) * 4.4 : 2.2), BOVEN + 0.005 + i * 0.002, -3.6)
  for (let i = 0; i < leden.length; i++) {
    const f = await maakFiguur(leden[i], i)
    f.scharnier.position.copy(rustPlaats(i, leden.length))
    f.scharnier.scale.setScalar(0.42)
    f.scharnier.rotation.x = -Math.PI / 2 + 0.01
    f.rust = rustPlaats(i, leden.length)
  }

  // ---------------- de gouden draad van de Koning naar het gekozen Raadslid
  const draadMat = new THREE.MeshStandardMaterial({ color: K.goud, emissive: K.goud, emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.3 })
  let draad = null
  function spanDraad(naarPunt) {
    if (draad) { boek.remove(draad); draad.geometry.dispose() }
    if (!naarPunt) return null
    const van = koning.scharnier.position.clone().add(new THREE.Vector3(0.6, koning.hoogte * 0.72, 0.05))
    const mid = van.clone().lerp(naarPunt, 0.5).add(new THREE.Vector3(0, 2.4, 0))
    const curve = new THREE.QuadraticBezierCurve3(van, mid, naarPunt)
    draad = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.03, 6, false), draadMat)
    draad.geometry.setDrawRange(0, 0)
    boek.add(draad)
    return draad
  }

  // ---------------- snippers (object pool)
  const snipperPool = []
  const actieveSnippers = new Set()
  function snipper(id) {
    let s = snipperPool.find((x) => !x.visible)
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); snipperPool.push(s); scene.add(s) }
    s.material.map?.dispose()
    s.material.map = snipperTex(id)
    s.material.opacity = 1
    s.material.needsUpdate = true
    s.scale.set(1.2, 0.45, 1)
    s.visible = true
    return s
  }
  const flitsMat = new THREE.SpriteMaterial({ map: gloedTex('rgba(255,220,140,1)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  function flits(pos) {
    const f = new THREE.Sprite(flitsMat.clone())
    f.position.copy(pos)
    f.scale.setScalar(0.1)
    scene.add(f)
    gsap.timeline({ onComplete: () => { scene.remove(f); f.material.dispose() } })
      .to(f.scale, { x: 2.2, y: 2.2, duration: 0.18, ease: 'power2.out' })
      .to(f.material, { opacity: 0, duration: 0.45 }, '<0.08')
  }

  // ---------------- de schaduw van een hersteld Achrona (finale): uitgeknipt silhouet tussen licht en muur
  const silhouetTex = canvasTex(1024, 400, (ctx, w, h) => {
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.moveTo(0, h)
    const vorm = [[0, 300], [60, 300], [60, 220], [90, 190], [120, 220], [120, 300], [210, 300], [210, 160], [235, 120], [260, 160], [260, 300],
      [330, 300], [330, 250], [400, 250], [400, 120], [430, 60], [460, 120], [460, 250], [540, 250], [540, 90], [570, 30], [600, 90], [600, 250],
      [680, 250], [680, 300], [760, 300], [760, 200], [790, 160], [820, 200], [820, 300], [880, 300], [900, 240], [930, 270], [960, 230], [1000, 280], [1024, 290], [1024, 400]]
    for (const [x, y] of vorm) ctx.lineTo(x, y)
    ctx.lineTo(0, h); ctx.closePath(); ctx.fill()
    for (let x = 0; x < w; x += 26) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 13, 330 + Math.random() * 30); ctx.lineTo(x + 26, h); ctx.fill() } // woud
  })
  const silhouet = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.5), new THREE.MeshBasicMaterial({ map: silhouetTex, transparent: true, opacity: 0, depthWrite: false }))
  silhouet.position.set(0, 6.4, -9.45)
  scene.add(silhouet)

  // ---------------- zegel
  const zegel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.18, 32), new THREE.MeshStandardMaterial({ color: '#8e1b1b', roughness: 0.45, metalness: 0.1, emissive: '#3a0505' }))
  zegel.visible = false
  zegel.castShadow = true
  scene.add(zegel)

  // ---------------- postprocessing
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), CONFIG.licht.bloom, CONFIG.licht.bloomStraal, CONFIG.licht.bloomDrempel)
  composer.addPass(bloom)
  const ts = CONFIG.licht.tiltShift
  const bokeh = new BokehPass(scene, camera, { focus: ts.focus, aperture: ts.aperture, maxblur: ts.maxBlur })
  composer.addPass(bokeh)
  composer.addPass(new OutputPass())

  // ---------------- camera: ademen, parallax, inzoomen op de spreker
  const muis = { x: 0, y: 0 }
  addEventListener('pointermove', (e) => { muis.x = e.clientX / innerWidth - 0.5; muis.y = e.clientY / innerHeight - 0.5 })
  const focus = { x: 0, z: 0, zoom: 1 }
  const kijk = new THREE.Vector3()

  // ---------------- klikken op figuren
  const raycaster = new THREE.Raycaster()
  let klikHandler = null
  renderer.domElement.addEventListener('click', (e) => {
    const r = renderer.domElement.getBoundingClientRect()
    raycaster.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera)
    const hit = raycaster.intersectObjects(Object.values(figuren).map((f) => f.mesh))[0]
    if (hit && klikHandler) klikHandler(hit.object.userData.rol)
  })

  // ---------------- render-lus (vertraagt als er niets beweegt, pauzeert als het tabblad verborgen is)
  let lite = false
  const klok = new THREE.Clock()
  let frame = 0, fpsT = 0, fpsN = 0, fps = 0
  function lus() {
    requestAnimationFrame(lus)
    if (document.hidden) return
    const dt = Math.min(0.05, klok.getDelta())
    const t = klok.elapsedTime
    frame++
    const actief = gsap.globalTimeline.getChildren(true, true, false).some((x) => x.isActive())
    if (!actief && frame % 2) return // niets aan het animeren: halve framerate

    for (const k of kaarsen) { // flakkeren via intensiteit en schaal
      if (!k.aan) continue
      const f = 1 + Math.sin(t * 9 + k.fase) * 0.06 + Math.sin(t * 23 + k.fase * 2) * 0.04
      k.vlam.scale.set(0.32 * f, 0.62 * (2 - f), 1)
      k.gloed.material.opacity = 0.75 + (f - 1) * 3
    }
    const aantalAan = kaarsen.filter((k) => k.aan).length
    for (const l of kaarsLicht) l.intensity = (2 + aantalAan * 0.55) * (1 + Math.sin(t * 7 + l.position.x) * 0.05)

    for (let i = 0; i < pixelData.length; i++) { // glitch-pixels rond de scheur
      const p = pixelData[i], seg = segmenten[p.seg]
      const s = seg.pixelsZicht * (Math.sin(t * 6 + p.f) > -0.3 ? 1 : 0.2)
      dummy.position.set(p.x + Math.sin(t * 13 + p.f) * 0.03 * seg.pixelsZicht, p.y + Math.sin(t * 1.3 + p.f) * 0.12, p.z)
      dummy.rotation.set(t + p.f, t * 0.7, 0)
      dummy.scale.setScalar(Math.max(0.0001, s))
      dummy.updateMatrix()
      pixels.setMatrixAt(i, dummy.matrix)
    }
    pixels.instanceMatrix.needsUpdate = true
    scheurMat.opacity = 0.75 + Math.sin(t * 17) * 0.2 * (Math.random() > 0.9 ? 1 : 0.3)

    if (!lite) {
      const pos = stofGeo.attributes.position
      for (let i = 0; i < stofN; i++) {
        let y = pos.getY(i) + dt * 0.12
        if (y > 9) y = 0
        pos.setY(i, y)
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05)
      }
      pos.needsUpdate = true
    }

    // camera
    const adem = Math.sin(t * 0.45) * 0.12
    camera.position.set(
      camBasis.x + focus.x * 0.35 + muis.x * 0.9,
      camBasis.y * focus.zoom + adem - muis.y * 0.5,
      camBasis.z * focus.zoom,
    )
    kijk.set(kijkBasis.x + focus.x * 0.55, kijkBasis.y, kijkBasis.z + focus.z * 0.3)
    camera.lookAt(kijk)

    if (lite) renderer.render(scene, camera)
    else composer.render()

    fpsN++; fpsT += dt
    if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0 }
  }
  lus()

  addEventListener('resize', () => {
    const w = container.clientWidth, h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  })

  // ------------------------------------------------------------------ API voor main.js
  const api = {
    figuren, koning, kaarsen, segmenten, tabs, silhouet, zegel, focus, schaduwLicht, koningLicht,
    onKlik: (fn) => (klikHandler = fn),
    fps: () => fps,
    zetLite(aan) {
      lite = aan
      renderer.shadowMap.enabled = !aan
      stof.visible = !aan
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true })
    },

    /** Punt (wereld) van de bovenkant van een figuur, om snippers en draad te laten vertrekken. */
    kopVan(rol) {
      const f = figuren[rol]
      if (!f) return new THREE.Vector3(3, BOVEN + 2, 0)
      const p = new THREE.Vector3(0, f.hoogte * 0.8, 0)
      return f.mesh.localToWorld(p)
    },

    /** Projecteer een wereldpunt naar schermcoördinaten (voor HTML-overlays). */
    naarScherm(v) {
      const p = v.clone().project(camera)
      return { x: (p.x * 0.5 + 0.5) * container.clientWidth, y: (-p.y * 0.5 + 0.5) * container.clientHeight }
    },

    kaarsAan(i, direct = false) {
      const k = kaarsen[i]
      if (!k || k.aan) return
      k.aan = true
      if (direct) { k.vlam.visible = k.gloed.visible = true; k.vlam.material.opacity = k.gloed.material.opacity = 1; return }
      k.vlam.visible = k.gloed.visible = true
      gsap.fromTo(k.vlam.material, { opacity: 0 }, { opacity: 1, duration: 0.4 })
      gsap.fromTo(k.gloed.material, { opacity: 0 }, { opacity: 0.8, duration: 0.8 })
    },
    kaarsUit(i, direct = false) {
      const k = kaarsen[i]
      if (!k || !k.aan) return
      k.aan = false
      if (direct) { k.vlam.visible = k.gloed.visible = false; return }
      gsap.to(k.vlam.scale, { y: 0.05, x: 0.08, duration: 0.35, ease: 'power2.in' })
      gsap.to([k.vlam.material, k.gloed.material], { opacity: 0, duration: 0.5, onComplete: () => { k.vlam.visible = k.gloed.visible = false } })
    },

    /** Raadslid klapt op en komt naar voren op de rechterpagina; de rest ligt plat achteraan. */
    zetSpreker(rol, direct = false) {
      const d = direct ? 0 : 0.9
      for (const [r, f] of Object.entries(figuren)) {
        if (r === 'koning') continue
        const actief = r === rol
        const doelPos = actief ? new THREE.Vector3(3.3, BOVEN, -0.4) : f.rust
        gsap.to(f.scharnier.position, { x: doelPos.x, y: doelPos.y, z: doelPos.z, duration: d, ease: 'power3.inOut' })
        gsap.to(f.scharnier.scale, { x: actief ? 1 : 0.42, y: actief ? 1 : 0.42, z: actief ? 1 : 0.42, duration: d, ease: 'power3.inOut' })
        gsap.to(f.scharnier.rotation, { x: actief ? 0 : -Math.PI / 2 + 0.01, duration: d, ease: actief ? 'back.out(1.6)' : 'power2.in', delay: actief ? d * 0.35 : 0 })
        gsap.to(f.mat, { emissiveIntensity: actief ? 0.05 : 0, duration: d })
        gsap.to(f.mat.color, { r: actief ? 1 : 0.55, g: actief ? 1 : 0.55, b: actief ? 1 : 0.55, duration: d })
      }
      gsap.to(focus, { x: rol ? 1.6 : 0, zoom: rol ? 0.92 : 1, duration: direct ? 0 : 1.4, ease: 'power2.inOut' })
      // schaduwtheater: het licht richt zich op de spreker en komt dichterbij, de schaduw op de muur groeit
      const doel = rol && figuren[rol] ? new THREE.Vector3(3.3, 2.2, -0.4) : new THREE.Vector3(0, 1.5, 0)
      gsap.to(schaduwLicht.target.position, { x: doel.x, y: doel.y, z: doel.z, duration: d })
      gsap.fromTo(schaduwLicht.position, { z: 9.5 }, { z: rol ? 6 : 8, x: rol ? 2.6 : 1.5, y: rol ? 0.95 : 1.2, duration: direct ? 0 : 2.4, ease: 'power2.out' })
    },

    koningGloed(aan, direct = false) {
      gsap.to(koning.mat, { emissiveIntensity: aan ? 0.35 : 0.04, duration: direct ? 0 : 0.5 })
      gsap.to(koningLicht, { intensity: aan ? 14 : 0, duration: direct ? 0 : 0.5 })
    },
    koningRecht(direct = false) {
      gsap.to(koning.scharnier.rotation, { x: 0, duration: direct ? 0 : 1.1, ease: 'back.out(1.5)' })
    },
    koningStaatOp(direct = false) { // het debat is voorbij
      gsap.to(koning.scharnier.position, { x: -2.6, z: 0.2, duration: direct ? 0 : 1.2, ease: 'power2.inOut' })
      gsap.to(koning.scharnier.scale, { x: 1.15, y: 1.15, z: 1.15, duration: direct ? 0 : 1.2 })
    },

    /** Gouden draad van de Koning naar het Raadslid; geeft een tween terug. */
    draadNaar(rol, direct = false) {
      if (!rol || !figuren[rol]) { spanDraad(null); return null }
      const naar = new THREE.Vector3(3.3, BOVEN + figuren[rol].hoogte * 0.75, -0.38)
      const d = spanDraad(naar)
      const max = d.geometry.index ? d.geometry.index.count : d.geometry.attributes.position.count
      if (direct) { d.geometry.setDrawRange(0, max); return null }
      const o = { n: 0 }
      return gsap.to(o, { n: max, duration: 1.0, ease: 'power2.inOut', onUpdate: () => d.geometry.setDrawRange(0, Math.floor(o.n / 3) * 3) })
    },

    paginaOm(direct = false) {
      if (direct) return
      losPagina.visible = true
      losPagina.rotation.z = 0
      return gsap.to(losPagina.rotation, { z: Math.PI, duration: 0.8, ease: 'power2.inOut', onComplete: () => (losPagina.visible = false) })
    },

    /** Eén ID: snipper stijgt op bij de spreker, vliegt naar het volgende scheursegment en last het met goud. */
    async snipperNaar(id, rol, segIndex, vertraging = 0) {
      const seg = segmenten[segIndex % segmenten.length]
      const s = snipper(id)
      const start = api.kopVan(rol)
      s.position.copy(start)
      const doel = seg.mid.clone()
      const boog = start.clone().lerp(doel, 0.5).add(new THREE.Vector3(0, 2.5, 0))
      const curve = new THREE.QuadraticBezierCurve3(start, boog, doel)
      const o = { t: 0 }
      const tl = gsap.timeline({ delay: vertraging, onComplete: () => actieveSnippers.delete(tl) })
      actieveSnippers.add(tl)
      await tl
        .to(s.position, { y: start.y + 0.7, duration: 0.25, ease: 'power2.out' })
        .to(o, { t: 1, duration: CONFIG.tempo.snipper, ease: 'power2.inOut', onUpdate: () => { const p = curve.getPoint(o.t); s.position.set(p.x, p.y + (1 - o.t) * 0.7, p.z) } })
        .to(s.scale, { x: 0.5, y: 0.2, duration: 0.15 }, '-=0.15')
        .then()
      s.visible = false
      flits(doel)
      api.lasSegment(segIndex)
    },

    lasSegment(i, direct = false) {
      const seg = segmenten[i % segmenten.length]
      if (seg.heel) return
      seg.heel = true
      seg.naad.visible = true
      if (direct) { seg.naad.scale.x = 1; seg.pixelsZicht = 0; seg.scheur.visible = false; return }
      gsap.to(seg.naad.scale, { x: 1, duration: 0.4, ease: 'power2.out' })
      gsap.to(seg, { pixelsZicht: 0, duration: 0.8 })
      gsap.to(seg.scheur.scale, { z: 0.01, duration: 0.6, onComplete: () => (seg.scheur.visible = false) })
    },

    herstelAlles() { // reset naar de begintoestand (nieuwe run of terugspoelen)
      for (const seg of segmenten) {
        seg.heel = false; seg.naad.visible = false; seg.naad.scale.x = 0.001; seg.pixelsZicht = 1
        seg.scheur.visible = true; seg.scheur.scale.z = 1
      }
      spanDraad(null)
      pixels.visible = true
      for (const sn of snipperPool) { gsap.killTweensOf([sn.position, sn.scale]); sn.visible = false }
      for (const tl of actieveSnippers) tl.kill()
      actieveSnippers.clear()
      for (const f of Object.values(figuren)) { gsap.killTweensOf([f.scharnier.scale, f.scharnier.position, f.scharnier.rotation]); if (f !== koning) f.scharnier.scale.setScalar(0.42) }
      koning.scharnier.scale.setScalar(1)
      koning.scharnier.position.set(-3.4, BOVEN, -0.9)
      for (const t of tabs) { t.material.emissive.set('#000000'); t.material.color.set('#ffffff') }
      gsap.killTweensOf([zegel.position, zegel.rotation, klap, silhouet.material])
      zegel.visible = false
      klap.a = 0
      zetKlap()
      silhouet.material.opacity = 0
    },

    naadFlits() { // alle gouden naden lichten tegelijk op
      return gsap.timeline()
        .to(naadMat, { emissiveIntensity: 5, duration: 0.5, ease: 'power2.out' })
        .to(naadMat, { emissiveIntensity: 1.4, duration: 1.2 })
    },

    tabVul(i, hersteld, zekerheid = 1) {
      const t = tabs[i]
      t.material.emissive.set(hersteld ? K.goud : K.paars)
      gsap.fromTo(t.material, { emissiveIntensity: 0 }, { emissiveIntensity: hersteld ? 0.25 + 0.9 * zekerheid : 0.9, duration: 1 })
    },

    async boekDicht() {
      spanDraad(null)
      const tl = gsap.timeline()
      for (const f of Object.values(figuren)) tl.to(f.scharnier.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.45, ease: 'power2.in' }, 0)
      tl.add(() => { pixels.visible = false; for (const seg of segmenten) seg.naad.visible = seg.scheur.visible = false }, 0.45)
      tl.to(klap, { a: Math.PI * 0.995, duration: 1.1, ease: 'power2.in', onUpdate: zetKlap }, 0.4)
      await tl.then()
    },
    async zegelVal() {
      zegel.visible = true
      zegel.position.set(-3.2, 8, 0)
      zegel.rotation.set(0.6, 0, 0.3)
      await gsap.timeline()
        .to(zegel.position, { y: BOVEN * 2 + 0.25, duration: 0.7, ease: 'bounce.out' })
        .to(zegel.rotation, { x: 0, z: 0, duration: 0.5 }, 0.2)
        .then()
    },
    async boekOpen() {
      await gsap.timeline()
        .to(zegel.position, { y: -2, duration: 0.01 }, 0.3)
        .to(klap, { a: 0, duration: 1.1, ease: 'power2.out', onUpdate: zetKlap }, 0.3)
        .then()
      zegel.visible = false
      pixels.visible = true
      for (const seg of segmenten) { seg.naad.visible = seg.heel; seg.scheur.visible = !seg.heel }
      gsap.to(koning.scharnier.scale, { x: 1, y: 1, z: 1, duration: 0.6 })
    },
    schaduwAchrona(direct = false) {
      gsap.to(silhouet.material, { opacity: 0.85, duration: direct ? 0 : 2.5, ease: 'power1.inOut' })
    },
  }
  return api
}
