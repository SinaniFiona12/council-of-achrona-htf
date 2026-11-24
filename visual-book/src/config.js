// Alle instelbare waarden van het Kroniekboek op één plek.
export const CONFIG = {
  kleuren: {
    nacht: '#150F1F',
    koning: '#1D4ED8',
    ijs: '#E6F4FF',
    paars: '#7E22CE',
    paars2: '#A855F7',
    geschil: '#E8562A',
    goud: '#F0A830',
    herstel: '#5EC4B6',
    papier: '#EFE4CC',
    hout: '#4a2e1a',
    was: '#efe2c4',
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

  // tempo in seconden bij 1× (de snelheidsknop schaalt alles)
  tempo: {
    opening: 1, // factor op de duur van de opening
    routering: 2.2, // draad spannen + reden schrijven
    toolcall: 0.55,
    woordenPerSeconde: 16, // KERN-tekst
    naBericht: 0.9,
    snipper: 1.1,
    finalePauze: 1.2,
  },

  // tekstbudget (alles wat langer is, staat volledig in het paneel)
  tekst: {
    redenWoorden: 14,
    openVragen: 3,
    kernTekens: 240,
  },

  licht: {
    bloom: 0.6,
    bloomStraal: 0.5,
    bloomDrempel: 0.85,
    schaduwMap: 1024,
    pixelRatioMax: 2,
    belichting: 1.05,
    tiltShift: { focus: 14.5, aperture: 0.00025, maxBlur: 0.006 },
  },

  kaarsen: 10, // = het Beurtenbudget
  naadSegmenten: 24, // stukken van de scheur die met bewijs gelast worden
  pixelsPerSegment: 10,
  pollMs: 1000,
}

export const kleurVan = (rol, i = 0) => CONFIG.rolKleuren[rol] || CONFIG.extraKleuren[i % CONFIG.extraKleuren.length]
export const naamVan = (rol) => rol === 'koning' ? 'De Koning' : rol === 'mens' ? 'Mens'
  : CONFIG.rolNamen[rol] || String(rol).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
