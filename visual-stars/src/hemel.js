// De hemel: alles is licht. Drie sterrenlagen met parallax, een nevel-shader met de Desync-glitch,
// en twee dynamische buffers (punten en lijnen) die main.js elke frame vult.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { CONFIG } from './config.js'

const MAX_PUNTEN = 3000
const MAX_LIJNEN = 9000 // segmenten

const PUNT_VERT = `
attribute float aGrootte; attribute float aAlpha; attribute float aFase; attribute vec3 aKleur;
uniform float uTijd; uniform float uPR; uniform float uGlitch; uniform vec2 uParallax; uniform float uSpring;
varying vec3 vKleur; varying float vAlpha;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 p = position;
  p.xy += uParallax;
  // de Desync: sterren verspringen af en toe
  float tik = floor(uTijd * 6.0);
  float spring = step(1.0 - 0.10 * uGlitch * uSpring, h(vec2(aFase, tik)));
  p.x += spring * (h(vec2(tik, aFase)) - 0.5) * 0.16;
  vKleur = mix(aKleur, vec3(0.66, 0.33, 0.97), spring * 0.8);
  vAlpha = aAlpha * (0.78 + 0.22 * sin(uTijd * 1.7 + aFase * 6.283));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aGrootte * uPR;
}`
const PUNT_FRAG = `
varying vec3 vKleur; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  float kern = pow(a, 5.0);
  gl_FragColor = vec4(vKleur * (0.55 + 1.9 * kern) * a * vAlpha, 1.0);
}`

const NEVEL_FRAG = `
varying vec2 vUv;
uniform float uTijd; uniform float uGlitch; uniform float uHerstel; uniform float uAspect;
uniform vec3 uNacht; uniform vec3 uPaars; uniform vec3 uPaars2; uniform vec3 uTeal; uniform vec3 uBlauw;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec2 uv = vUv;
  float tik = floor(uTijd * 8.0);
  float band = step(1.0 - 0.07 * uGlitch, h(vec2(floor(uv.y * 26.0), tik)));
  uv.x += band * (h(vec2(tik, floor(uv.y * 26.0))) - 0.5) * 0.22;
  vec2 p = vec2(uv.x * uAspect, uv.y) * 2.1;
  float a = fbm(p + vec2(uTijd * 0.012, -uTijd * 0.008));
  float b = fbm(p * 1.9 + a * 1.6 + 3.0);
  vec3 kleur = uNacht;
  kleur += uPaars * 0.34 * smoothstep(0.42, 0.85, b) * (0.35 + 0.65 * uGlitch);
  kleur += uBlauw * 0.16 * smoothstep(0.5, 0.9, a);
  kleur += uTeal * 0.15 * uHerstel * smoothstep(0.45, 0.85, fbm(p * 1.3 + 11.0));
  vec2 blok = floor(uv * vec2(128.0, 72.0));
  float pixel = step(1.0 - 0.02 * uGlitch, h(blok + tik * 0.37));
  kleur += uPaars2 * pixel * 0.26;
  kleur += uPaars2 * band * 0.07;
  gl_FragColor = vec4(kleur, 1.0);
}`

export function maakHemel(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  const pr = Math.min(window.devicePixelRatio || 1, CONFIG.licht.pixelRatioMax)
  renderer.setPixelRatio(pr)
  renderer.setClearColor(CONFIG.kleuren.nacht)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10)
  const K = (hex) => new THREE.Color(hex)

  // nevel
  const nevelMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uTijd: { value: 0 }, uGlitch: { value: 1 }, uHerstel: { value: 0 }, uAspect: { value: 1 },
      uNacht: { value: K(CONFIG.kleuren.nacht) }, uPaars: { value: K(CONFIG.kleuren.paars) }, uPaars2: { value: K(CONFIG.kleuren.paars2) },
      uTeal: { value: K(CONFIG.kleuren.herstel) }, uBlauw: { value: K(CONFIG.kleuren.koning) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: NEVEL_FRAG,
  })
  const nevel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nevelMat)
  nevel.frustumCulled = false
  nevel.renderOrder = -10
  scene.add(nevel)

  const puntMat = (spring) => new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTijd: { value: 0 }, uPR: { value: pr }, uGlitch: { value: 1 }, uParallax: { value: new THREE.Vector2() }, uSpring: { value: spring } },
    vertexShader: PUNT_VERT, fragmentShader: PUNT_FRAG,
  })

  // drie sterrenlagen
  const lagen = CONFIG.hemel.sterren.map((aantal, laag) => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(aantal * 3), kleur = new Float32Array(aantal * 3)
    const grootte = new Float32Array(aantal), alpha = new Float32Array(aantal), fase = new Float32Array(aantal)
    const tinten = [K('#E6F4FF'), K('#BFD3FF'), K('#D9C2FF'), K('#FFE9C2')]
    for (let i = 0; i < aantal; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 3.2; pos[i * 3 + 1] = (Math.random() * 2 - 1) * 1.15
      const t = tinten[(Math.random() * tinten.length) | 0]
      kleur.set([t.r, t.g, t.b], i * 3)
      grootte[i] = (1.6 + Math.random() * 2.2) * (1 + laag * 0.75)
      alpha[i] = (0.25 + Math.random() * 0.5) * (0.55 + laag * 0.22)
      fase[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aKleur', new THREE.BufferAttribute(kleur, 3))
    g.setAttribute('aGrootte', new THREE.BufferAttribute(grootte, 1))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    g.setAttribute('aFase', new THREE.BufferAttribute(fase, 1))
    const p = new THREE.Points(g, puntMat(1))
    p.frustumCulled = false
    p.renderOrder = -5 + laag
    scene.add(p)
    return p
  })

  // dynamische lijnen
  const lijnGeo = new THREE.BufferGeometry()
  const lPos = new Float32Array(MAX_LIJNEN * 6), lKleur = new Float32Array(MAX_LIJNEN * 6)
  lijnGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage))
  lijnGeo.setAttribute('color', new THREE.BufferAttribute(lKleur, 3).setUsage(THREE.DynamicDrawUsage))
  const lijnen = new THREE.LineSegments(lijnGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }))
  lijnen.frustumCulled = false
  scene.add(lijnen)

  // dynamische punten
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(MAX_PUNTEN * 3), pKleur = new Float32Array(MAX_PUNTEN * 3)
  const pGrootte = new Float32Array(MAX_PUNTEN), pAlpha = new Float32Array(MAX_PUNTEN), pFase = new Float32Array(MAX_PUNTEN)
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage))
  pGeo.setAttribute('aKleur', new THREE.BufferAttribute(pKleur, 3).setUsage(THREE.DynamicDrawUsage))
  pGeo.setAttribute('aGrootte', new THREE.BufferAttribute(pGrootte, 1).setUsage(THREE.DynamicDrawUsage))
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage))
  pGeo.setAttribute('aFase', new THREE.BufferAttribute(pFase, 1).setUsage(THREE.DynamicDrawUsage))
  const punten = new THREE.Points(pGeo, puntMat(0))
  punten.frustumCulled = false
  punten.renderOrder = 5
  scene.add(punten)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.licht.bloom, CONFIG.licht.bloomStraal, CONFIG.licht.bloomDrempel)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  let nP = 0, nL = 0, aspect = 1, lite = false
  const muis = { x: 0, y: 0, tx: 0, ty: 0 }
  window.addEventListener('pointermove', (e) => { muis.tx = e.clientX / innerWidth - 0.5; muis.ty = e.clientY / innerHeight - 0.5 })

  function resize() {
    const w = container.clientWidth || innerWidth, hgt = container.clientHeight || innerHeight
    aspect = w / hgt
    camera.left = -aspect; camera.right = aspect; camera.updateProjectionMatrix()
    renderer.setSize(w, hgt); composer.setSize(w, hgt)
    nevelMat.uniforms.uAspect.value = aspect
  }
  window.addEventListener('resize', resize)
  resize()

  return {
    kleur: K,
    get aspect() { return aspect },
    canvas: renderer.domElement,
    begin() { nP = 0; nL = 0 },
    punt(x, y, grootte, kleur, alpha = 1, fase = 0) {
      if (nP >= MAX_PUNTEN || alpha <= 0.003) return
      pPos[nP * 3] = x; pPos[nP * 3 + 1] = y; pPos[nP * 3 + 2] = 0
      pKleur[nP * 3] = kleur.r; pKleur[nP * 3 + 1] = kleur.g; pKleur[nP * 3 + 2] = kleur.b
      pGrootte[nP] = grootte; pAlpha[nP] = alpha; pFase[nP] = fase; nP++
    },
    lijn(x1, y1, x2, y2, kleur, alpha = 1) {
      if (nL >= MAX_LIJNEN || alpha <= 0.003) return
      const i = nL * 6
      lPos[i] = x1; lPos[i + 1] = y1; lPos[i + 2] = 0; lPos[i + 3] = x2; lPos[i + 4] = y2; lPos[i + 5] = 0
      lKleur[i] = lKleur[i + 3] = kleur.r * alpha; lKleur[i + 1] = lKleur[i + 4] = kleur.g * alpha; lKleur[i + 2] = lKleur[i + 5] = kleur.b * alpha
      nL++
    },
    setLite(aan) { lite = aan; nevel.visible = !aan; renderer.setClearColor(CONFIG.kleuren.nacht) },
    render(tijd, glitch, herstel) {
      muis.x += (muis.tx - muis.x) * 0.04; muis.y += (muis.ty - muis.y) * 0.04
      lagen.forEach((l, i) => {
        const u = l.material.uniforms
        u.uTijd.value = tijd; u.uGlitch.value = glitch
        u.uParallax.value.set(-muis.x * CONFIG.hemel.parallax[i] * 6, muis.y * CONFIG.hemel.parallax[i] * 6)
      })
      punten.material.uniforms.uTijd.value = tijd
      nevelMat.uniforms.uTijd.value = tijd; nevelMat.uniforms.uGlitch.value = glitch; nevelMat.uniforms.uHerstel.value = herstel
      for (const a of ['position', 'aKleur', 'aGrootte', 'aAlpha', 'aFase']) pGeo.attributes[a].needsUpdate = true
      pGeo.setDrawRange(0, nP)
      lijnGeo.attributes.position.needsUpdate = true; lijnGeo.attributes.color.needsUpdate = true
      lijnGeo.setDrawRange(0, nL * 2)
      if (lite) renderer.render(scene, camera)
      else composer.render()
    },
  }
}
