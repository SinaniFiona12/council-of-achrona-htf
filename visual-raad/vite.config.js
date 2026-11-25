// De Raadzaal van Achrona: Vite-config.
// De dev-server leest alleen trace.json en verdict.json uit de root van de repo (of uit voorbeeld/ met ?trace=voorbeeld)
// en serveert ze op /data/<naam> (of /data/voorbeeld/<naam>). Bij `npm run build` gaan ze mee in de site, zodat die
// ook op een gewone statische host draait. De trace zelf wordt nooit gewijzigd.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BESTANDEN = new Set(['trace.json', 'verdict.json'])
const MAPPEN = { '': REPO, voorbeeld: path.join(REPO, 'voorbeeld') }

function achronaData() {
  const serveer = (req, res, next) => {
    const delen = new URL(req.url, 'http://lokaal').pathname.split('/').filter(Boolean)
    const naam = delen.pop() || ''
    const sleutel = delen.join('/')
    const map = Object.hasOwn(MAPPEN, sleutel) ? MAPPEN[sleutel] : null
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
    generateBundle() { // de run meebouwen: dist/data/trace.json, dist/data/verdict.json en het voorbeeld
      for (const [sleutel, map] of Object.entries(MAPPEN)) for (const naam of BESTANDEN) {
        const bestand = path.join(map, naam)
        if (fs.existsSync(bestand)) this.emitFile({ type: 'asset', fileName: ['data', sleutel, naam].filter(Boolean).join('/'), source: fs.readFileSync(bestand) })
        else if (naam === 'trace.json' && !sleutel) this.error('trace.json ontbreekt in de root van de repo: zonder run valt er niets te tonen')
      }
    },
  }
}

export default defineConfig({
  publicDir: false,
  server: { port: 5176, strictPort: false },
  plugins: [achronaData()],
})
