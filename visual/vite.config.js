// The Mending of Achrona: Vite-config.
// De dev-server leest alleen trace.json en verdict.json uit de root van de repo (of uit voorbeeld/ met ?map=voorbeeld)
// en serveert ze op /data/<naam>. Er wordt nooit iets geschreven.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BESTANDEN = new Set(['trace.json', 'verdict.json'])
const MAPPEN = { '': REPO, voorbeeld: path.join(REPO, 'voorbeeld') }

function achronaData() {
  const serveer = (req, res, next) => {
    const url = new URL(req.url, 'http://lokaal')
    const naam = url.pathname.replace(/^\/+/, '')
    const map = MAPPEN[url.searchParams.get('map') || '']
    if (!BESTANDEN.has(naam) || !map) return next()
    const bestand = path.join(map, naam)
    if (!fs.existsSync(bestand)) {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(fs.readFileSync(bestand))
  }
  return {
    name: 'achrona-data',
    configureServer(server) { server.middlewares.use('/data', serveer) },
    configurePreviewServer(server) { server.middlewares.use('/data', serveer) },
  }
}

export default defineConfig({
  publicDir: 'assets', // visual/assets/avatars/<rol>.svg wordt /avatars/<rol>.svg
  server: { port: 5173, strictPort: false },
  plugins: [achronaData()],
})
