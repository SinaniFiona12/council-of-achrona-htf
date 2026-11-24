// Alle instelbare waarden van de Raadzaal op één plek.
export const CONFIG = {
  kleuren: { nacht: '#0d0915', koning: '#1D4ED8', koningLicht: '#6C9BFF', ijs: '#E6F4FF', paars: '#A855F7', geschil: '#E8562A', goud: '#F0A830', herstel: '#5EC4B6' },
  rolKleuren: {
    archmage: '#8B7CF6', engineer: '#38BDF8', guardian_keeper: '#A3B4C8',
    historian: '#D4A373', oracle: '#E879F9', beast_master: '#84CC16',
  },
  extraKleuren: ['#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#FB7185'],
  rolNamen: {
    archmage: 'Archmage', engineer: 'Engineer', guardian_keeper: 'Guardian Keeper',
    historian: 'Historian', oracle: 'Oracle', beast_master: 'Beast Master',
  },

  // duur per stap in seconden bij 1× (de snelheid schaalt alles)
  tempo: {
    opening: 3.2,
    routering: 4.2,
    stop: 5,
    toolcall: 0.9,
    berichtMin: 3.6,
    berichtPerWoord: 0.09, // leestijd van de KERN-regel
    berichtMax: 7.5,
    geschil: 4.2, // per geschil
    finale: 9, // per scherm van het vonnis
  },

  // tekstbudget (alles wat langer is, staat volledig in het paneel)
  tekst: { redenWoorden: 20, vraagWoorden: 28, openVragen: 3, openWoorden: 11, kernTekens: 220, idChips: 7, histWoorden: 10, vonnisWoorden: 28, actieWoorden: 20 },
  presentatieSeconden: 110, // toets P: de hele run in ongeveer zoveel seconden
  pixel: 4, // grootte van één beeldpixel (in schermpixels): hoger = grover
  kleurNiveaus: 9, // aantal tinten per kleurkanaal: lager = vlakker, meer raster
  budget: 10, // het Beurtenbudget = de tien kaarsen op tafel
  pollMs: 1000,
}

export const kleurVan = (rol, i = 0) => rol === 'koning' ? CONFIG.kleuren.koningLicht
  : CONFIG.rolKleuren[rol] || CONFIG.extraKleuren[Math.max(0, i) % CONFIG.extraKleuren.length]
export const naamVan = (rol) => rol === 'koning' ? 'De Koning' : rol === 'mens' ? 'Mens'
  : CONFIG.rolNamen[rol] || String(rol).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
