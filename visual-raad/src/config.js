// Alle instelbare waarden van de Raadzaal op één plek.
export const CONFIG = {
  kleuren: { nacht: '#0d0915', koning: '#1D4ED8', koningLicht: '#6C9BFF', ijs: '#E6F4FF', paars: '#A855F7', geschil: '#E8562A', goud: '#F0A830', herstel: '#5EC4B6' },
  rolKleuren: {
    archmage: '#8B7CF6', engineer: '#38BDF8', guardian_keeper: '#A3B4C8',
    historian: '#D4A373', oracle: '#E879F9', beast_master: '#84CC16',
  },
  extraKleuren: ['#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#FB7185'],
  // waar elke Rol voor opkomt: het publieke Belang uit rolkaarten.md, in gewone woorden
  belang: {
    archmage: 'de magie', engineer: 'het datanet', guardian_keeper: 'de veiligheid van de burcht',
    historian: 'het archief', oracle: 'de profetieën', beast_master: 'de dieren en het woud',
  },
  rolNamen: {
    archmage: 'Archmage', engineer: 'Engineer', guardian_keeper: 'Guardian Keeper',
    historian: 'Historian', oracle: 'Oracle', beast_master: 'Beast Master',
  },

  // duur per stap in seconden bij 1× (de snelheid schaalt alles)
  tempo: {
    opening: 3.2,
    toolcall: 1.1,
    basis: 2.4, // leestijd per dialoog: vaste aanloop (het uittypen) ...
    perWoord: 0.32, // ... plus zoveel seconden per woord in beeld (ongeveer 3 woorden per seconde)
    min: 5,
    max: 14,
    finale: 15, // per scherm van het vonnis
  },

  // tekstbudget (alles wat langer is, staat volledig in het paneel)
  tekst: { redenWoorden: 14, vraagWoorden: 24, kernWoorden: 30, openVragen: 2, openWoorden: 9, kernTekens: 400, idChips: 7, vonnisWoorden: 26, actieWoorden: 16 },
  presentatieSeconden: 180, // toets P: de hele run in ongeveer zoveel seconden (sneller dan je alles kunt lezen)
  pixel: 4, // grootte van één beeldpixel (in schermpixels): hoger = grover
  kleurNiveaus: 11, // aantal tinten per kleurkanaal: lager = vlakker, meer raster
  budget: 10, // het Beurtenbudget = de tien kaarsen op tafel
  pollMs: 1000,
}

export const kleurVan = (rol, i = 0) => rol === 'koning' ? CONFIG.kleuren.koningLicht
  : CONFIG.rolKleuren[rol] || CONFIG.extraKleuren[Math.max(0, i) % CONFIG.extraKleuren.length]
export const naamVan = (rol) => rol === 'koning' ? 'De Koning' : rol === 'mens' ? 'Mens'
  : CONFIG.rolNamen[rol] || String(rol).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
