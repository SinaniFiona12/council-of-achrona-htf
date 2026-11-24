# Briefing voor Claude (en teamleden): Council of Achrona

Dit bestand is de overdracht tussen laptops. Een Claude-sessie die hier verder werkt, leest dit eerst volledig:
deel 1 is de stand van zaken (wat al gebouwd en beslist is), deel 2 is het volledige plan (v2) van het team.
Antwoord altijd in het Nederlands.

---

## Deel 1: stand van zaken (bijgewerkt om 11:40 op 24/11)

### Wat er al werkt
- **Deel A (de Council) werkt en `uv run validate` is GROEN.** De laatste geldige run (`verdict.json` + `trace.json`
  in de root, zelfde run_id) staat gecommit en gepusht. Dat is de veilige basis; ze wordt later vervangen door een betere run.
- `raadsleden/`: alle 6 Rollen (archmage, beast_master, engineer, guardian_keeper, historian, oracle), met NAAM en
  PERSPECTIEF uit `rolkaarten.md`.
- `council.py`:
  - `kies_volgende()`: de Koning is een LLM-agent (MODEL_GROOT) via de synchrone `openai.OpenAI`-client, met
    `response_format: json_object` (en een terugval zonder JSON-modus). Robuuste JSON-parsing (`lees_json`). Fallback-regel
    (wie nog niet sprak, anders wie het langst geleden sprak) met een reden die met `fallback (...)` begint.
    Hij geeft `(rol, vraag, reden, open_vragen)` terug; `open_vragen` komt in elke routering. Zelf stoppen mag pas na
    `MIN_BEURTEN = 5`. Wordt in `run()` opgeroepen via `asyncio.to_thread`.
  - Raadsleden: raadplegen eerst hun bron via MCP; zonder toolcall krijgen ze één herkansing.
  - Verdict + geschillen in **één** Koning-call (`stel_verdict_op`): ID's worden genormaliseerd (koppeltekens), alleen
    ID's die een Raadslid in het debat noemde blijven over, bewering zonder bewijs wordt `null`, validatie tegen het schema
    met één herkansing en een veilige fallback.
  - Budget: `uv run council --budget` toont gratis (geen LLM-call) hoeveel van de $5 gebruikt is (endpoint `/key/info`).
    Elke run toont het budget vóór en na, met een luide waarschuwing bij **$3 of minder** (instelbaar met `BUDGET_WAARSCHUWING`).
- `tests/test_offline.py`: 21 offline tests, **0 tokens**. Draai na elke wijziging aan `council.py`:
  `uv run python tests/test_offline.py`.
- **Deel B v1** (`visual/`, "The Mending of Achrona"): Vite + GSAP, werkt en is gepusht. Leest alleen `trace.json` en
  `verdict.json`, speelt een run af of volgt hem live. Start: `cd visual && npm install && npm run dev` (poort 5173,
  testdata met `?map=voorbeeld`). **Blijft ongewijzigd als backup**; het Kroniekboek komt in een nieuwe map `visual-book/`.

### Kosten en budget
- Gebruikt rond 11:40: **$0.16 van $5**. Een volledige run kost ±$0.05 en ±320.000 tokens.
- **Zuinig zijn:** test eerst offline (gratis), vraag het team vóór elke echte `uv run council`, en zeg waarvoor de run dient.

### Belangrijk voor een nieuwe laptop
1. `uv` installeren, dan `uv sync`. Op een Mac met de repo op het **Desktop** (iCloud): iCloud verbergt bestanden in
   `.venv`, waardoor `uv run council` faalt met "No module named 'council'". Oplossing: zet de venv buiten iCloud.
   Zet in `~/.zshrc`: `export UV_PROJECT_ENVIRONMENT="$HOME/.venvs/council-of-achrona"`, open een nieuwe terminal en draai
   `uv sync` opnieuw.
2. `.env` maken (`cp .env.example .env`) met de teamkey (blok 1) en de MCP-regels voor alle 6 Rollen:
   `MCP_<ROL>=https://mcp.findingsolutions.be/<rol>/mcp`. **Nooit committen, nooit tonen.**
3. Kennisbronnen (alleen nodig zonder MCP of om zelf te lezen): `https://mcp.findingsolutions.be/pack.zip`, uitpakken in de
   root. `kennisbronnen/*/` staat in `.gitignore`: **nooit committen**.
4. Werk samen via git: eerst `git pull`, daarna kleine commits en meteen `git push`. Werk niet tegelijk in hetzelfde bestand.

### Afspraken met het team
- Na elke wijziging: committen én pushen, zodat de ander kan pullen. Commit nooit `.env`, de teamkey of `kennisbronnen/`.
- Geen inhoud uit de Kennisbronnen in prompts, code of in dit bestand (geen ID's, feiten, namen of dagen uit de bronnen).
  Ook geen prompts die stiekem naar het antwoord sturen: instructies blijven algemeen genoeg voor een andere zaak.
- Om **14:30** feature-stop: daarna één definitieve run, `uv run validate` groen, `verdict.json` + `trace.json` uit dezelfde
  run committen en pushen (ruim vóór 16:00), en de visualisatie testen op die run.

### Wat nog moet (volgens het plan hieronder)
- **Deel A, kleine aanvullingen (±35 min, 1 run):** KERN-regel bij Raadsleden (A1), `BELANG` per Rol in `raadsleden/*.py`
  en zichtbaar voor de Koning, reden max. 1 zin, max. 5 open vragen, stoppen als 2 beurten niets nieuws gaven, één retry
  bij ongeldige JSON (A2), samenvatting 2-3 zinnen (A3), MCP-regels voor alle Rollen in `.env.example`.
  Daarna `uv run python tests/test_offline.py` (de tests verwachten nu een 4-tuple uit `kies_volgende()`).
- **Deel B v2: het Kroniekboek** in `visual-book/`, laag per laag (L1 → L5, zie B11). Na L3 is er een sterke demo.

---

## Deel 2: het volledige plan van het team (v2)

```
=====================================================================
HACK THE FUTURE 2026 · CHALLENGE 113 · "COUNCIL OF ACHRONA" (Roboest)
VOLLEDIG PLAN: DEEL A (de Council) + DEEL B (het Kroniekboek)
=====================================================================
Antwoord altijd in het Nederlands. Inleveren: 16:00. Feature-stop: 14:30.

Lees eerst grondig (als je dat nog niet deed): README.md, rolkaarten.md,
schema/verdict.json, schema/trace.json, council.py, validate.py, raadsleden/,
viewer.html, viewer.py, voorbeeld/, voorbeelden/devui_debat.py, .env.example,
en de pptx (alle slides + sprekersnotities). Bij twijfel gaan de README en de
schema's VOOR op dit plan. Staat iets in dit plan dat een regel zou breken: stop en
meld het me in plaats van het te doen.

=====================================================================
0. PRIORITEIT EN VEILIGHEID
=====================================================================
- Verdict + Council = het grootste deel van de punten. Presentatie = de rest.
  Volgorde: DEEL A eerst werkend en GROEN, pas daarna DEEL B.
- Bestaand werk NOOIT weggooien. Commit de huidige staat eerst
  ("checkpoint voor plan v2"). Bouw het Kroniekboek in een NIEUWE map visual-book/;
  een bestaande visualisatie blijft ongewijzigd als backup.
- Commit vaak met duidelijke berichten. Commit NOOIT .env, de teamkey of kennisbronnen/.

=====================================================================
1. HARDE SPELREGELS (uit de kit; nooit overschrijden)
=====================================================================
R1  Eén Raadslid per Rol (archmage, engineer, guardian_keeper, historian, oracle,
    beast_master). Elk Raadslid leest ALLEEN de Kennisbron van zijn eigen Rol.
R2  De Koning leidt het debat en stelt het Verdict op, maar leest ZELF GEEN Kennisbron
    (geen MCP-tools, geen bestanden). Hij kent alleen wat Raadsleden in het debat zeggen.
R3  Max 10 Raadslid-beurten per run (Beurtenbudget). Alleen berichten van Raadsleden
    tellen; toolcalls, routeringen en Koning-berichten niet.
R4  Vóór ELKE Raadslid-beurt staat een routering in de trace (aan, vraag, reden),
    naar precies die Rol. (validate.py controleert dit.)
R5  GEEN inhoud uit de Kennisbronnen in prompts of code: geen record-ID's, geen feiten,
    geen namen/dagen uit de bronnen. Ook niet "als voorbeeld". Alles wat de Council weet,
    komt uit het debat. (Rolnamen, perspectieven en Belangen uit rolkaarten.md mogen:
    die zijn publiek.)
R6  trace.json is de ONGEWIJZIGDE uitvoer van de run die het Verdict maakte. Nooit met de
    hand bewerken. Alles in de trace (ook geschillen) wordt door de code tijdens de run
    geschreven.
R7  verdict.json en trace.json in de root, uit DEZELFDE run (zelfde run_id).
    Kleine correcties in verdict.json (bv. koppeltekens) mogen; inhoudelijk niet.
R8  Menselijke tussenkomst mag, maar komt als spreker "mens" in de trace en een
    routering door een mens telt niet voor de Council-score. De INGELEVERDE run wordt
    volledig door de Koning geleid, zonder menselijke input.
R9  ID's in het formaat ^(ARC|ENG|GUA|HIS|ORA|BEA)-[0-9]{3}$ met een GEWOON koppelteken.
R10 uv run validate moet GROEN zijn vóór we inleveren.
R11 Budget: teamkey $5, max 60 calls/min, tot 18:00. Niet verspillen aan nutteloze runs.

VRIJ (hier mogen we creatief zijn): de Koning als agent/regels/mix, welke en hoeveel
Rollen, prompts, wat elk Raadslid van het debat ziet, extra velden in trace/verdict
("extra velden mogen"), het hele visualisatieplatform en de stijl.

=====================================================================
2. DEEL A: DE COUNCIL (Python + uv + Microsoft Agent Framework + MCP, zoals de kit)
=====================================================================
Niet van platform wisselen. Werk in council.py en raadsleden/.

--- A1. Raadsleden ---
- Maak een bestand per gekozen Rol (kopie van raadsleden/oracle.py) met ROL, NAAM,
  PERSPECTIEF uit rolkaarten.md. Voeg MCP_<ROL> toe aan .env.example (niet .env committen).
- Advies: begin met alle 6 Rollen aanwezig (meer kennis beschikbaar). De Koning hoeft
  niet iedereen aan het woord te laten: hij kiest, en dat toont juist orchestration.
  Kijk na een eerste run of minder Rollen beter werkt en motiveer de keuze.
- Instructie per Raadslid (aanvullen op de bestaande instructies() van de kit):
  * Lees of doorzoek ALTIJD eerst je Kennisbron met je tools vóór je spreekt
    (lees_kennisbron, zoek, zoek_betekenis, toon).
  * Begin je antwoord met één regel:  KERN: <één zin, met record-ID's>
    daarna max ~120 woorden uitleg.
  * Noem bij elke bewering de exacte record-ID's zoals ze in je bron staan. Verzin nooit
    een ID. Zeg eerlijk wat je niet weet.
  * Je hebt een Belang (uit je Rolkaart) en kan ernaast zitten: onderscheid wat je bron
    BEWIJST van wat je VERMOEDT.
  * Reageer op de vraag van de Koning en op wat anderen zeiden; herhaal niets wat al
    gezegd is.
  * Verwijst je bron naar een andere Rol: zeg dat expliciet ("dit moet de <rol> toetsen").

--- A2. De Koning als agent in kies_volgende(beurten, leden) ---
Technisch:
- kies_volgende() is NIET async en wordt opgeroepen terwijl er al een event loop draait.
  Gebruik dus GEEN asyncio.run() erin. Gebruik de synchrone openai.OpenAI-client
  (zelfde OPENAI_BASE_URL/OPENAI_API_KEY uit .env, model MODEL_GROOT).
- Vraag JSON terug (response_format json_object als het endpoint dat ondersteunt; anders
  in de prompt) en parse robuust: zoek het eerste {...}-blok, strip tekst/markdown eromheen.
- Valideer het antwoord: rol moet een Rol uit `leden` zijn of null; vraag een string;
  reden een niet-lege string. Bij ongeldige JSON: één retry; daarna fallback naar een
  regel (de Rol die het langst niet sprak / nog niet sprak), met een reden die zegt dat
  het een fallback is. Crash nooit.
- Retourneer (rol, vraag, reden). Breid de routering-beurt in de trace uit met
  open_vragen (lijst strings): pas de code in run() aan zodat beurt(..., "routering", ...)
  ook open_vragen meeschrijft (extra uitdaging, optioneel schemaveld).

Wat de Koning ziet (input):
- De Raadsleden (ROL, NAAM, PERSPECTIEF, Belang uit de rolkaarten), wie al sprak en hoe
  vaak, het resterende budget (10 - gesproken), het debat tot nu toe (berichten van
  Raadsleden en eventuele eerdere Koning-berichten), en zijn eigen vorige open_vragen.
- GEEN toolresultaten of Kennisbron-inhoud zelf (R2): alleen wat Raadsleden zeiden.

Instructie voor de Koning (schrijf dit uit in de systeemprompt, zonder bron-inhoud):
- Doel: de oorzaak van de Desync vinden in drie delen: INGREEP (wie deed wat, wanneer),
  MECHANISME (hoe leidt dat tot de symptomen), VERLOOP (het patroon in de tijd),
  elk gestaafd met record-ID's uit het debat, plus een herstelplan en risico's.
- Kies elke beurt bewust. Goede redenen om iemand te kiezen:
  * een bewering moet getoetst worden door een andere Rol (kruiscontrole)
  * iemand verwijst naar een Rol die nog niet sprak
  * twee Raadsleden spreken elkaar tegen: laat de Rol met het beslissende bewijs spreken
  * een deel van de oorzaak (ingreep/mechanisme/verloop) heeft nog geen bewijs
  * een Raadslid beweert iets zonder ID: vraag om bewijs
- Vermijd verspilde beurten: niemand laten herhalen of samenvatten wat al gezegd is.
- Stel een GERICHTE vraag (niet "geef je inbreng"), bv. "Bevestig of weerleg met je
  bron wat de <rol> zei over <onderwerp uit het debat>".
- reden: max 1 concrete zin die naar het debat verwijst (de jury leest dit!).
  Nooit "vaste volgorde".
- open_vragen: max 5 korte vragen die nog open staan; werk ze na elke beurt bij
  (beantwoorde vragen verdwijnen).
- STOP ZELF (rol: null, vraag: null, reden: waarom het genoeg is) zodra alle drie de
  delen een bewering met bewijs hebben van minstens één Raadslid en de belangrijkste
  tegenspraak beslecht is, OF als de laatste 2 beurten niets nieuws opleverden.
  Liever vroeg stoppen met een sterke reden dan het budget opmaken.
- Antwoord ALLEEN met JSON:
  {"rol": "<rol>|null", "vraag": "<string>|null", "reden": "<1 zin>", "open_vragen": ["..."]}

--- A3. Het Verdict (na het debat, door de Koning, MODEL_GROOT) ---
- Vervang het TODO-sjabloon. De Koning krijgt het volledige debat (alleen
  Raadslid-berichten + routeringen), geen Kennisbron.
- Laat hem JSON maken die exact schema/verdict.json volgt:
  run_id (zelfde als de trace), samenvatting (2-3 zinnen),
  oorzaak.ingreep / .mechanisme / .verloop: {bewering: string|null, bewijs: [ID's],
  zekerheid: 0-1}. Regels: bewering zonder bewijs = verboden → dan bewering null en
  bewijs []. Eerlijk onbekend is beter dan verzinnen.
  acties: geordend herstelplan (volgorde = uitvoeringsvolgorde), elk {actie, reden,
  bewijs?}. risicos: minstens 1, elk {risico, mitigatie}.
  voorspelling (extra): {dag (int >= 1), bewering, bewijs} ALLEEN als het debat daar
  bewijs voor bevat; anders weglaten.
- Na het genereren, IN CODE:
  * normaliseer speciale koppeltekens in ID's (‐‑‒–—―−) naar "-"
  * houd alleen ID's die echt in de debattekst voorkwamen (anti-hallucinatie); verwijder
    andere ID's. Wordt een bewijslijst daardoor leeg, zet de bewering dan op null.
  * valideer met jsonschema tegen schema/verdict.json; bij fouten: één retry met de
    foutmelding erbij; daarna een veilige versie (null-beweringen) i.p.v. crashen.

--- A4. Geschillen in de trace ---
- Na het debat (vóór of samen met het Verdict) laat de Koning de geschillen bepalen
  uit het debat: [{onderwerp, standpunten: {<rol>: "<standpunt>"}, uitkomst: string|null,
  bewijs: [ID's]}]. Uitkomst met tekst = minstens 1 bewijs-ID, anders uitkomst null.
- Zelfde normalisatie + ID-filter als bij het Verdict. Schrijf ze in trace["geschillen"]
  via de code tijdens de run (R6), daarna bewaar("trace.json", trace).

--- A5. Kwaliteit en controle ---
- Na elke wijziging: uv run council → uv run validate → toon me de routeringen
  (reden + open_vragen per beurt) en het Verdict.
- Controleer zelf in de trace: had elk Raadslid een toolcall vóór zijn bericht? Staan er
  ID's in de berichten? Is er geen enkele reden "vaste volgorde"? Stopte de Koning zelf?
- Toon het verbruik (tokens) per run; wees zuinig met runs (R11).
- Zet GEEN bron-inhoud in prompts of code (R5), ook niet om te "helpen".

=====================================================================
3. DEEL B: "HET KRONIEKBOEK VAN ACHRONA" (visual-book/)
=====================================================================
--- B0. Concept in één zin ---
Een 3D pop-upboek op een houten tafel bij kaarslicht. Alles in het boek is plat,
korrelig 2D-papier. De Desync (digitale corruptie: pixels, glitch) heeft de kroniek
verscheurd; terwijl de Council debatteert, herstelt het boek zich (analoog: inkt,
papier, goud). Kern-contrast: ANALOOG vs DIGITAAL = magie + technologie.

--- B1. Harde regels voor de visualisatie ---
- Leest ALLEEN trace.json en verdict.json (net als viewer.html). Schrijft NIETS terug,
  roept GEEN LLM aan, beïnvloedt de Council nooit (R6, R8).
- 100% juist: elk element komt uit de trace; niets verzinnen, niets weglaten.
- Werkt live (pollt tijdens `uv run council`), met voorbeeld/trace.json, met een halve
  trace (status "bezig"), en met een lege of ontbrekende verdict.json. Nooit crashen.

--- B2. Data → beeld (exacte mapping) ---
| Trace / Verdict                    | Beeld in het boek                                    |
| trace.raadsleden                   | welke papierfiguren er zijn (1 per Rol)              |
| routering (aan, vraag, reden)      | Koning (links) → gouden draad → Raadslid klapt op    |
|                                    | (rechts); reden schrijft zich met ganzenveer          |
| routering.aan = null               | de Koning staat op: het debat is voorbij (+ reden)   |
| routering.open_vragen              | handgeschreven notities in de kantlijn; verdwenen    |
|                                    | vragen worden doorgestreept en vervagen               |
| toolcall (tool, argumenten, pad)   | flap/treklipje gaat open: decor van de Rol vouwt uit;|
|                                    | icoon per tool (lees/zoek/zoek_betekenis/toon)       |
| bestand (fallback zonder MCP)      | zelfde als toolcall, label "bron in prompt"          |
| bericht.tekst                      | tekstballon met de KERN-regel (fallback: 1e zin)     |
| ID's in bericht.tekst (regex)      | gouden papiersnippers met het ID die naar de scheur  |
|                                    | vliegen en die dichtplakken (gouden naad, kintsugi)  |
| Raadslid-berichten (aantal)        | 10 kaarsen; elk bericht dooft er één                 |
| geschillen                         | pagina's flippen heen en weer tussen de standpunt-   |
|                                    | rollen, papier scheurt met glitch; uitkomst = gouden |
|                                    | las + bewijslabels; uitkomst null = scheur blijft    |
| verdict.oorzaak.{3 delen}          | 3 hoofdstukken INGREEP / MECHANISME / VERLOOP;       |
|                                    | bewering = hersteld + gouden naad; null = gescheurd  |
|                                    | en glitchend; zekerheid = helderheid van de naad +   |
|                                    | dunne balk                                           |
| verdict.acties (volgorde)          | genummerde stappen op de vonnispagina                |
| verdict.risicos                    | rode lakzegels met de mitigatie eronder              |
| verdict.voorspelling               | papieren draaischijf (volvelle) die naar "dag X"     |
|                                    | draait, met de bewering                              |
| trace.verbruik                     | klein voetnootje op de laatste pagina (tokens)       |
Elk element is klikbaar: opent een paneel met de RUWE trace-beurt (nr, ronde, spreker,
soort, volledige tekst/argumenten). Zo kan de jury alles verifiëren.

--- B3. Scène en compositie ---
- 3D: houten tafel, open boek (stijve pagina's die om de rug scharnieren; GEEN buigend
  papier), 10 kaarsen in een boog achter het boek, een muur erachter voor schaduwen,
  zwevend stof in het licht, lichte mist, vignet en korrel.
- 2D: papierfiguren en decors = platte planes met SVG-textures, met een witte
  "papierrand" en een dun schaduwrandje zodat ze als uitgeknipt papier ogen.
- Vaste plekken: linkerpagina = de Koning + kantlijn met open vragen;
  rechterpagina = de huidige spreker + zijn decor; bovenrand = 3 hoofdstuk-tabs
  (INGREEP / MECHANISME / VERLOOP) die zich vullen; kaarsen = het budget.
- Camera: licht "ademend" zweven; zoomt zacht in op de spreker; tilt-shift-onscherpte
  aan de randen (miniatuur-gevoel). Muis = kleine parallax (geen vrije orbit die
  verwart).

--- B4. Signature moments (hier zit de wow; eerst deze perfect maken) ---
1. OPENING: zwart; één kaars ontsteekt, dan de rest. Het boek slaat open, pagina's
   fladderen. Paarse digitale glitch scheurt door het papier: stukken vallen uiteen in
   pixelblokjes die wegzweven, letters veranderen in random tekens. Titel
   "De Kroniek van Achrona" in blackletter.
2. DE KONING KIEST: scène dimt, de Koning-figuur licht blauw op; een gouden draad
   spant zich naar het gekozen Raadslid, dat omhoog klapt; de ganzenveer schrijft de
   reden; zijn SCHADUW groeit reusachtig op de muur (schaduwtheater).
3. BEWIJS: elk ID wordt een gouden snipper die opstijgt, naar de scheur vliegt en
   vastklikt met een flits; de pixelblokjes in die zone trekken terug en worden weer
   papier; een kaars dooft (sis).
4. GESCHIL: pagina's flippen wild heen en weer tussen twee rollen (touwtrekken), het
   papier scheurt met glitch en bliksem; bij de uitkomst valt het boek stil en wordt
   de scheur met goud gelast.
5. VONNIS (finale): stilte. Alle gouden naden lichten tegelijk op, de laatste pixels
   worden papier, het boek klapt dicht (doffe klap); op de muur verschijnt de schaduw
   van een hersteld Achrona (torens, woud, burcht). Een wassen zegel valt op de kaft.
   Het boek opent op de vonnispagina die zichzelf in kalligrafie schrijft: oorzaak (3
   hoofdstukken met zekerheid), acties, risico's, voorspelling-draaischijf. Delen met
   bewering null blijven eerlijk gescheurd en glitchend.

--- B5. Interactie (simpel, nooit verwarrend) ---
- AUTOPLAY (standaard voor de pitch): speelt de trace af met een goed tempo;
  pauze/hervat met spatie; snelheid 0.5x/1x/2x.
- LIVE-modus: volgt de lopende run; nieuwe beurten spelen af zodra ze verschijnen.
- Na afloop: terugbladeren met ← → (elke pagina = één Raadslid-beurt met de routering
  ervoor); klik op elk element voor de ruwe trace.
- Kleine bediening rechtsonder: autoplay/live, snelheid, geluid aan/uit, "lite".
  Geen andere knoppen of menu's.

--- B6. Duidelijkheid (er staat nu te veel tekst: oplossen) ---
- Eén focus tegelijk: alleen de huidige spreker scherp en verlicht, de rest gedimd.
- Tekstbudget: reden Koning = 1 zin (~12 woorden, langer = afkappen met "…" en volledig
  in het paneel); Raadslid = alleen de KERN-regel + ID-labels; open vragen max 3
  zichtbaar; vonnis 1 zin per deel.
- Beeld i.p.v. tekst: kaarsen i.p.v. "x/10", helderheid/balk i.p.v. zekerheidsgetal,
  icoon i.p.v. tool-JSON, bliksem + 2 namen i.p.v. een alinea.
- Leesbaar op een beamer: min. ~22px bodytekst, hoog contrast (ijswit op donker),
  max 2 fonts tegelijk zichtbaar. Lange tekst altijd als HTML-overlay, niet als
  3D-texture.

--- B7. Performance ---
- Max 2-3 echte schaduwlichten (bv. de 2 kaarsen het dichtst bij de spreker + 1
  key light); overige kaarsen = sprite-gloed + bloom, flikkering via intensiteit.
- Shadow map max 1024; renderer pixelRatio = min(devicePixelRatio, 2).
- InstancedMesh/object pool voor snippers, pixelblokjes en stof.
- Pollen elke 1s; alleen verwerken als het aantal beurten of de status veranderde.
- Render-loop vertraagt als er niets animeert; pauze als het tabblad verborgen is.
- Textures en geluid lazy laden; SVG's één keer rasteren naar canvas-textures.
- "Lite"-schakelaar: zet bloom, tilt-shift, schaduwen en stof uit.
- FPS-teller alleen in dev (?debug=1).
- Doel: vloeiend (~60fps, min. 30) op een gewone laptop.

--- B8. Branding (stijl "The Curse of Achrona"; event-illustraties NIET kopiëren) ---
Kleuren:
  achtergrond/nacht   #150F1F
  elektrisch blauw    #1D4ED8  (de Koning, zijn draad/licht)
  ijswit              #E6F4FF  (tekst)
  kristalpaars        #7E22CE → #A855F7  (de Desync, glitch)
  oranje-rood         #E8562A  (geschillen, risico's)
  goud                #F0A830  (bewijs, naden, zegel, vonnis)
  turquoise           #5EC4B6  (herstel-accenten)
  papier              warm crème (#EFE4CC-achtig) met vezelstructuur
Een eigen accentkleur per Rol (gebruikt in de rand van de figuur en de tekstballon).
Fonts (Google Fonts): UnifrakturMaguntia (titels/hoofdstukken), Alegreya SC (labels),
een leesbare serif voor tekst (bv. Alegreya).
Stijl: vlak, hoekig, korrelig (SVG feTurbulence-noise), circuitlijnen in middeleeuwse
elementen, warm kaarslicht tegenover koud glitchlicht.

--- B9. Geluid (optioneel, na de kern; standaard UIT tot de gebruiker het aanzet) ---
Papier ritselen (pagina), ganzenveer krassen (schrijven), kaars sissen (doven),
papier scheuren (geschil), zachte klik + kling (snipper), doffe klap (boek dicht),
digitale ruis (glitch), lage drone (sfeer). Gebruik Web Audio API-gegenereerde
geluiden of gratis bestanden met licentie (vermeld de bron in de README). Mute-knop.

--- B10. Stack en structuur ---
- Vite + vanilla JS (ES modules), Three.js, GSAP, three/examples postprocessing
  (EffectComposer, UnrealBloomPass, BokehPass voor tilt-shift).
- visual-book/
    index.html, src/main.js, src/config.js (ALLE instelbare waarden: snelheden, kleuren,
    licht, tekstbudget), src/data.js (pollen + parsen + normaliseren van de trace),
    src/scene/ (tafel, boek, kaarsen, figuren, snippers, glitch), src/ui/ (overlays,
    paneel, bediening), src/audio.js
    assets/avatars/<rol>.svg + koning.svg, assets/decors/<rol>.svg
    (nu placeholders: gekleurde papierfiguur met initiaal; ik vervang ze door eigen SVG's)
- Vite dev-server serveert ../trace.json en ../verdict.json uit de root (middleware of
  proxy). Optie ?trace=voorbeeld om voorbeeld/trace.json te laden.
- README-sectie "Het Kroniekboek starten": npm install, npm run dev, live naast
  `uv run council`, en de bediening.

--- B11. Bouwvolgorde (na elke laag werkt het al) ---
L1 (±45m) tafel + boek + kaarsen + camera + data-laag + papierfiguren die opklappen
   bij een routering + KERN-tekstballon, met voorbeeld/trace.json
L2 (±30m) gouden draad + ganzenveer-reden + kaarsen doven + snippers met ID's
L3 (±30m) finale: naden, boek dicht, zegel, vonnispagina, 3 hoofdstukken
L4 (±30m) opening met glitch/pixelblokjes + schaduwtheater op de muur
L5 (als er tijd is) geschil-animatie, kantlijnvragen doorstrepen, decors bij toolcall,
   draaischijf, terugbladeren, tilt-shift, geluid, lite-modus
Na L3 hebben we een sterke demo. Alles daarna is bonus.

=====================================================================
4. WERKWIJZE EN TIJDLIJN
=====================================================================
1. Geef eerst een kort plan (A en B) met een tijd per stap en de keuzes die je maakt.
   Wacht op mijn akkoord.
2. Bouw DEEL A stap voor stap; na elke stap run + validate + routeringen tonen.
3. Daarna DEEL B per laag (L1 → L5); na elke laag: hoe start ik het, wat zie ik.
   Ik geef feedback met screenshots. Maak waarden instelbaar via config.js.
4. Waarschuw me om 14:30: feature-stop. Dan nog: één goede, definitieve run met de
   teamkey, uv run validate GROEN, verdict.json + trace.json uit dezelfde run committen
   en pushen, en het Kroniekboek testen op die definitieve trace.
5. Hulp voor de pitch (±3 min, vraag: "waarom werkt jullie Council beter dan één
   agent?"): autoplay die in ~2 minuten de definitieve run toont, plus advies om een
   backup-video op te nemen.

DEFINITION OF DONE
- uv run validate = GROEN, geen "TODO" in verdict.json, zelfde run_id.
- Geen enkele routering met "vaste volgorde"; de Koning stopt zelf met een reden;
  open_vragen in de routeringen; geschillen ingevuld.
- Elk Raadslid had een toolcall vóór zijn bericht; alle ID's in het Verdict komen uit
  het debat.
- Geen bron-inhoud in code of prompts; .env niet gecommit; trace.json niet bewerkt.
- Het Kroniekboek speelt de definitieve trace correct en vloeiend af, met autoplay.
```
