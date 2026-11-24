// Alle instelbare waarden van het Sterrenbeeld op één plek.
export const CONFIG = {
  kleuren: {
    nacht: '#150F1F',
    koning: '#1D4ED8',
    koningLicht: '#6C9BFF',
    ijs: '#E6F4FF',
    paars: '#7E22CE',
    paars2: '#A855F7',
    geschil: '#E8562A',
    goud: '#F0A830',
    herstel: '#5EC4B6',
  },
  rolKleuren: {
    archmage: '#8B7CF6',
    engineer: '#38BDF8',
    guardian_keeper: '#A3B4C8',
    historian: '#D4A373',
    oracle: '#E879F9',
    beast_master: '#84CC16',
  },
  extraKleuren: ['#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#FB7185'],
  rolNamen: {
    archmage: 'Archmage', engineer: 'Engineer', guardian_keeper: 'Guardian Keeper',
    historian: 'Historian', oracle: 'Oracle', beast_master: 'Beast Master',
  },

  // duur per stap in seconden bij 1× (de snelheidsknop schaalt alles)
  tempo: {
    opening: 2.6,
    routering: 3.4,
    stop: 4.5,
    toolcall: 0.7,
    berichtMin: 3.2,
    berichtPerWoord: 0.085, // leestijd van de KERN-regel
    berichtMax: 7,
    geschil: 3.6, // per geschil
    finale: 4,
  },

  // tekstbudget (alles wat langer is, staat volledig in het paneel)
  tekst: { redenWoorden: 20, vraagWoorden: 26, openVragen: 3, openWoorden: 11, kernTekens: 210, idChips: 7, histWoorden: 11, vonnisWoorden: 25, actieWoorden: 18 },
  presentatieSeconden: 105, // toets P: de hele run in ongeveer zoveel seconden
  rolSymbool: { archmage: '▲', engineer: '⚙', guardian_keeper: '◈', historian: '☰', oracle: '◉', beast_master: 'ψ' },

  hemel: { sterren: [900, 500, 160], parallax: [0.006, 0.014, 0.03] },
  licht: { bloom: 0.85, bloomStraal: 0.6, bloomDrempel: 0.32, pixelRatioMax: 2 },
  budget: 10, // het Beurtenbudget
  pollMs: 1000,
}

export const kleurVan = (rol, i = 0) => rol === 'koning' ? CONFIG.kleuren.koningLicht
  : CONFIG.rolKleuren[rol] || CONFIG.extraKleuren[Math.max(0, i) % CONFIG.extraKleuren.length]
export const naamVan = (rol) => rol === 'koning' ? 'De Koning' : rol === 'mens' ? 'Mens'
  : CONFIG.rolNamen[rol] || String(rol).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
