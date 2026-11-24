// Data-laag: trace.json en verdict.json ophalen (alleen lezen), robuust tegen halve of ontbrekende bestanden.
import { CONFIG } from './config.js'

const PARAM = new URLSearchParams(location.search)
export const BRON = PARAM.get('trace') || PARAM.get('map') || '' // ?trace=voorbeeld
export const DEBUG = PARAM.has('debug')
const url = (naam) => `/data/${naam}${BRON ? `?map=${encodeURIComponent(BRON)}` : ''}`

/** { ok: true, data } bij succes (data null = bestand bestaat niet), { ok: false } = vorige toestand houden. */
export async function haal(naam) {
  try {
    const r = await fetch(url(naam), { cache: 'no-store' })
    if (r.status === 404) return { ok: true, data: null }
    if (!r.ok) return { ok: false }
    return { ok: true, data: JSON.parse(await r.text()) }
  } catch {
    return { ok: false } // half geschreven bestand of server even weg
  }
}

// Record-ID's: het Achrona-formaat, maar ook ID's van het voorbeeld (bv. MOL-007).
export const ID_RE = /\b[A-Z]{3}[-‐‑‒–—―−]\d{3}\b/g
export const normaalID = (id) => id.replace(/[‐‑‒–—―−]/, '-')
export const idsIn = (tekst) => [...new Set((String(tekst || '').match(ID_RE) || []).map(normaalID))]

const zonderOpmaak = (t) => String(t || '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').trim()

/** De KERN-regel van een bericht; zonder KERN-regel de eerste zin. */
export function kernVan(tekst) {
  const t = zonderOpmaak(tekst)
  const m = /^\s*[-*]?\s*KERN\s*:\s*(.+)$/im.exec(t)
  let kern = m ? m[1] : (t.split(/(?<=[.!?])\s+/)[0] || t)
  kern = kern.trim()
  return kern.length > CONFIG.tekst.kernTekens ? kern.slice(0, CONFIG.tekst.kernTekens - 1).trimEnd() + '…' : kern
}

/** Eerste zin, ingekort tot n woorden met "…". */
export function kortZin(tekst, n = CONFIG.tekst.redenWoorden) {
  const zin = (zonderOpmaak(tekst).split(/(?<=[.!?])\s+/)[0] || '').trim()
  const woorden = zin.split(/\s+/).filter(Boolean)
  return woorden.length > n ? woorden.slice(0, n).join(' ') + '…' : zin
}

export const isLid = (trace, rol) => (trace?.raadsleden || []).includes(rol)

/** Hoogste "dag N" die in het debat genoemd wordt (voor de draaischijf van de voorspelling). */
export function laatsteDag(trace) {
  let max = 0
  for (const b of trace?.beurten || []) for (const m of String(b.tekst || '').matchAll(/\bdag (\d{1,3})\b/gi)) max = Math.max(max, +m[1])
  return max
}
