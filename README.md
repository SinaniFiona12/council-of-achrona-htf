# Council of Achrona

Onze inzending voor challenge 113 van Hack The Future 2026 (Roboest): een Council van AI-agenten die samen uitzoekt wat Achrona overkwam en hoe het hersteld wordt.

## Wat is er gebeurd?

De **Desync** heeft de herinneringen en systemen van Achrona versnipperd: de magie hapert, de schilden lekken en het archief klopt niet meer. Niemand ziet het geheel. Zes Rollen (Archmage, Engineer, Guardian Keeper, Historian, Oracle, Beast Master) kennen elk maar een stuk van het verhaal, in hun eigen Kennisbron, en elke Rol heeft een eigen Belang.

De vraag: **wat is de oorzaak, hoe herstellen we het, en wat kan daarbij misgaan?**

## Onze oplossing

Een raadszitting. De **Koning** (een LLM-agent) leidt het debat, maar leest zelf geen enkele Kennisbron. Elke beurt verloopt in drie stappen:

1. **De Koning kiest wie spreekt**, met een gerichte vraag en een reden (de `routering` in de trace).
2. **Het Raadslid leest zijn eigen Kennisbron** via MCP. Zonder toolcall krijgt het één herkansing.
3. **Het Raadslid antwoordt met bewijs**: één KERN-zin en record-ID's uit zijn bron.

De Koning houdt een lijst open vragen bij, laat beweringen door een andere Rol toetsen en stopt zelf zodra verdere beurten niets meer toevoegen (uiterlijk na 10 Raadslid-beurten). Daarna stelt hij het **Council Verdict** op:

| Deel van het Verdict | De vraag die het beantwoordt |
|---|---|
| `oorzaak.ingreep` | Wie deed wat, en wanneer? |
| `oorzaak.mechanisme` | Hoe leidde dat tot de Desync? |
| `oorzaak.verloop` | Welk patroon zien we in de tijd? |
| `acties` | Hoe lossen we het op, in welke volgorde? |
| `risicos` | Wat kan er misgaan, en hoe vangen we dat op? |
| `voorspelling` | Wanneer slaat de Desync opnieuw toe als niemand ingrijpt? |

Elk deel van de oorzaak krijgt een `zekerheid` en record-ID's als bewijs. De code houdt alleen ID's over die een Raadslid echt in het debat noemde; een bewering zonder bewijs wordt eerlijk `null`. De meningsverschillen tussen de Raadsleden staan als `geschillen` in de trace.

**Waarom werkt een Council hier beter dan één agent?** Eén agent met alle bronnen neemt de stelligste bron over. In de Council kent elk Raadslid alleen zijn eigen bron en heeft het een eigen Belang, dus moet elke bewering door een andere Rol getoetst worden. De Koning weegt alleen wat met record-ID's op tafel kwam, en elke keuze is na te lezen in de trace.

### Het resultaat bekijken

Het antwoord van onze Council staat in [`verdict.json`](verdict.json), het volledige debat in [`trace.json`](trace.json) (uit dezelfde run). Het duidelijkst zie je het in **de Raadzaal**, onze 3D-visualisatie:

```
cd visual-raad
npm install
npm run dev
```

Open http://localhost:5176 en druk op **P**: de hele zitting speelt in ongeveer 110 seconden af en eindigt met twee schermen, *Wat is er gebeurd?* en *Hoe lossen we het op?*. Meer uitleg staat bij "De Raadzaal starten" hieronder.

### Zelf een zitting draaien

```
uv sync
uv run python tests/test_offline.py   # gratis: test de Koning, het Verdict en de spelregels zonder LLM
uv run council                        # een echte zitting (kost tokens van de teamkey)
uv run validate                       # toetst verdict.json en trace.json aan de schema's en de spelregels
```

Je hebt een `.env` nodig (kopie van `.env.example`) met de teamkey en de MCP-adressen.

### Waar staat wat?

| Bestand | Wat |
|---|---|
| `council.py` | De Koning (`kies_volgende()`, `stel_verdict_op()`), de instructies van de Raadsleden en het debat zelf |
| `raadsleden/` | Eén bestand per Rol: naam, perspectief en publiek Belang uit `rolkaarten.md` |
| `tests/test_offline.py` | Tests zonder LLM-calls |
| `visual-raad/` | De Raadzaal: de zitting in 3D bij kaarslicht (voor de pitch) |
| `visual-stars/`, `visual-book/`, `visual/` | Eerdere visualisaties van dezelfde trace, als reserve |
| `verdict.json`, `trace.json` | De ingeleverde run |

### Zo houden we ons aan de spelregels

| Spelregel | Hoe |
|---|---|
| Elk Raadslid leest alleen zijn eigen Kennisbron | Elk Raadslid krijgt alleen de MCP-tool van zijn eigen Rol; het pad staat bij elke toolcall in de trace |
| De Koning leest geen Kennisbron | De Koning heeft geen tools: hij krijgt alleen de tekst van het debat |
| Maximaal 10 Raadslid-beurten | `BEURTENBUDGET` in `council.py`; `uv run validate` telt na |
| Een routering vóór elke Raadslid-beurt | De code schrijft elke keuze van de Koning in de trace, met vraag, reden en open vragen |
| Geen inhoud uit de Kennisbronnen in prompts of code | De prompts beschrijven alleen de werkwijze; wat de Council weet, komt uit het debat |
| `trace.json` is onbewerkt | De code schrijft de trace tijdens de run; de visualisaties lezen alleen |

---

# De starter kit van Roboest

Hieronder staat de oorspronkelijke handleiding van de starter kit waarop we bouwden, met de spelregels en de jurering. Waar de kit "TODO" of "vaste volgorde" noemt, beschrijft dat het vertrekpunt, niet onze inzending.

De Desync heeft de herinneringen en systemen van Achrona versnipperd. Jullie bouwen een **Council**: een zwerm van samenwerkende AI-agenten (Raadsleden) die elk één Rol vertolken, debatteren, verspreide kennis analyseren en samen tot een **Council Verdict** komen: wat is de oorzaak, wat is het herstelplan, welke risico's zijn er.

Deze kit geeft jullie binnen het eerste halfuur een draaiende mini-Council die je live in je browser ziet debatteren. Het echte werk is aan jullie: de **Koning** het debat laten leiden. Hij beslist welk Raadslid spreekt, met welke vraag en waarom. (In AI-termen heet dat deel een orchestrator.)

## Wat je krijgt op de dag

| Wat | Wanneer | Waar |
|---|---|---|
| Deze repo (GitHub-template) | vooraf | GitHub |
| LLM-toegang: Teamkaartje met je teamkey voor het Roboest-endpoint ($5 budget, tot 18:00) | 10:00 | coaches |
| Optioneel: je eigen FreeLLMAPI (gratis, zie "FreeLLMAPI (optioneel)") | vooraf | je laptop |
| Rolkaarten: perspectief, Belang en Kennisbron per Rol | in deze repo | `rolkaarten.md` |
| Challenge pack: Kennisbronnen (bestanden) | 10:00 | `https://<mcp-host>/pack.zip` |
| MCP-server: één pad per Rol, `https://<mcp-host>/<rol>/mcp` | antwoordt vanaf 10:00 (daarvoor geeft `uv run council` een MCP-fout) | in je `.env` |
| Coaches | de hele dag | in de zaal |

## Vooraf installeren

- Python 3.12 of hoger
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- git en een GitHub-account
- een code-editor

### LLM-toegang

Op de dag krijgt elk team om 10:00 een **Teamkaartje** met een teamkey voor het Roboest-endpoint (`https://roboest.findingsolutions.be/v1`, OpenAI-compatibel). Je kiest er twee modellen mee: `achrona` (klein, voor de Raadsleden) en `achrona-groot` (voor de Koning). Achter die namen wisselt het endpoint zelf tussen providers. De key heeft een budget van $5 en werkt tot 18:00. Je hoeft vooraf niets te installeren.

### FreeLLMAPI (optioneel)

Wil je een back-up als je budget op is, of zelf modellen kiezen? [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) bundelt de gratis tiers van veel LLM-providers achter één OpenAI-compatibel endpoint op je eigen laptop.

1. Installeer het: op Windows de desktop-app uit de [Microsoft Store](https://apps.microsoft.com/detail/9PBN6G8K2B7F); op macOS de app uit [Releases](https://github.com/tashfeenahmed/freellmapi/releases/latest); met Docker `curl -fsSL https://freellmapi.co/install.sh | bash`.
2. Open http://localhost:3001 en voeg op de **Keys**-pagina minstens 2 gratis provider-keys toe (bv. Google AI Studio en Groq). Aanmelden bij een provider vraagt soms een telefoonverificatie: doe dit thuis, niet op de dag.
3. Zet blok 2 van `.env.example` in je `.env` (in plaats van blok 1) met de **unified key** bovenaan de Keys-pagina.

Maak thuis al je repo aan (stap 1–2 hieronder) en draai daarin `uv sync` (en `uv sync --extra devui` als je de DevUI wil). Dan staat alles al geïnstalleerd en verlies je op de dag geen tijd op de wifi.

## Snel starten

1. Klik op **Use this template** en maak een eigen repo aan. Zet die **openbaar**: zo lever je in (zie onderaan).
2. Clone je repo en ga erin staan.
3. Maak je `.env`: kopieer het voorbeeld (`copy .env.example .env` op Windows, `cp .env.example .env` op macOS/Linux), vul in blok 1 de teamkey van je Teamkaartje in en vul de `MCP_<ROL>`-regels in.
4. Open de debatviewer in een tweede terminal:
   ```
   uv run viewer
   ```
5. Start de Council:
   ```
   uv run council
   ```
   In de viewer zie je live wie de Koning aan het woord laat en waarom, wat elk Raadslid zegt, welke Kennisbron het leest en hoeveel tokens het kost.
6. Controleer de uitvoer:
   ```
   uv run validate
   ```
   Groen = `verdict.json` en `trace.json` volgen het schema en komen uit dezelfde run. Groen betekent geldig, nog niet goed: het Verdict van de kit is nog leeg (TODO).

Geen uv? Maak een venv (`python -m venv .venv`, activeer met `.venv\Scripts\activate` op Windows of `source .venv/bin/activate`), dan `pip install -e .` en `python viewer.py`, `python council.py`, `python validate.py`.

Viewer op een andere poort: zet `VIEWER_PORT=8101` als omgevingsvariabele. Een andere map bekijken, bv. het voorbeeld: `uv run viewer voorbeeld`.

### Hoe start ik de visualisatie ("The Mending of Achrona")?

Een eigen, live visualisatie van het debat in `visual/` (Vite + GSAP). Ze leest alleen `trace.json` en `verdict.json` uit de root, pollt ze elke seconde en verandert er niets aan. Je hebt [Node.js](https://nodejs.org) nodig.

```
cd visual
npm install
npm run dev
```

Open http://localhost:5173. Start daarna in een tweede terminal `uv run council`: de visualisatie loopt live mee. Een afgeronde run wordt vanaf het begin afgespeeld. Testdata uit het voorbeeld: http://localhost:5173/?map=voorbeeld.

- **Wat je ziet**: de blauwe spotlight van de Koning en zijn bevel (vraag en reden), open vragen als mist, circuitlijnen als een Raadslid zijn bron leest, tekstballonnen woord voor woord, elk record-ID als gouden scherf in het herstelmozaïek, geschillen als oranje bliksem, en op het einde het Verdict als perkamentrol (delen zonder bewijs blijven gebroken).
- **Bediening**: afspelen/pauzeren (ook met de spatiebalk), snelheid 1×/2×/4×, de tijdlijn om terug te spoelen, *Live* om naar het einde te springen, *Verdict* om het perkament te openen.
- **Eigen avatars**: vervang `visual/assets/avatars/<rol>.svg` door je eigen SVG met dezelfde bestandsnaam.
- **Netwerk**: de lettertypes (UnifrakturMaguntia, Alegreya SC, Alegreya) komen van Google Fonts; zonder internet valt de pagina terug op een gewone serif.

### De Raadzaal starten (3D-visualisatie voor de pitch)

De zitting als een raadzaal bij kaarslicht (Three.js + GSAP) in `visual-raad/`. De stijl is getekende pixelart: het 3D-beeld wordt op lage resolutie gerenderd, met vlakke schaduwen, donkere inktlijnen rond elke vorm, weinig tinten per kleur en een lichte papierkorrel. Alles is in code gebouwd: de zaal, de tafel en de personages bestaan uit eenvoudige vormen, zonder modellen of afbeeldingen, en de portretten zijn momentopnamen van die personages. Net als de andere viewers leest de Raadzaal alleen `trace.json` en `verdict.json`: ze schrijft niets en roept geen LLM aan.

```
cd visual-raad
npm install
npm run dev
```

Open http://localhost:5176. Start `uv run council` in een tweede terminal om live mee te kijken; een afgeronde run speelt vanaf het begin af. Testdata: http://localhost:5176/?trace=voorbeeld.

- **Wat je ziet**: de Koning zit op zijn troon, de Raadsleden rond de tafel, elk onder de banier van zijn Rol. Bovenaan staat welke van de drie stappen bezig is. De camera gaat naar wie spreekt en iedereen kijkt naar de spreker. Een routering is een lichtstraal over de tafel van de Koning naar het gekozen Raadslid. Leest een Raadslid zijn bron, dan gaat er een oplichtend boek voor hem open. Elk record-ID wordt een blad bewijs op tafel; noemt een tweede Rol hetzelfde ID, dan schuift het blad naar het midden. De tien kaarsen zijn het Beurtenbudget: elk Raadslid-bericht dooft er één. Het sigil in de tafel is paars en onrustig zolang de Desync onverklaard is en wordt goud bij het vonnis.
- **Na het debat**: de geschillen komen één voor één (goud = beslecht, oranje en trillend = open). Dan volgt het vonnis in twee schermen: *Wat is er gebeurd?* (ingreep, mechanisme en verloop, met bewijs, zekerheid en de Rollen die het bewijs leverden) en *Hoe lossen we het op?* (herstelplan, risico's en de voorspelling).
- **Bediening**: **P** = presentatiemodus (de hele run in ongeveer 110 seconden), **R** = herstart, **spatie** = pauze, **← →** = vorige of volgende beurt. Rechtsonder staan ook Live, de snelheid en Lite (zonder schaduwen en gloed). Klik op het dialoogvenster, een personage, een blad bewijs of een deel van het vonnis voor de ruwe trace.
- **Instellen**: tempo, kleuren en tekstlengtes staan in `visual-raad/src/config.js`. Daar staan ook `pixel` (hoe grof de pixels zijn) en `kleurNiveaus` (hoeveel tinten per kleur). De knop Lite toont het gladde 3D-beeld zonder pixelstijl.

### Het Sterrenbeeld starten (eerdere visualisatie, reserve)

Het debat als een levend sterrenbeeld (Three.js + GSAP) in `visual-stars/`. Alles is licht, deeltjes en lijnen; er zijn geen getekende assets. Net als de andere viewers leest het alleen `trace.json` en `verdict.json`: het schrijft niets en roept geen LLM aan.

```
cd visual-stars
npm install
npm run dev
```

Open http://localhost:5175. Start `uv run council` in een tweede terminal om live mee te kijken; een afgeronde run speelt vanaf het begin af. Testdata: http://localhost:5175/?trace=voorbeeld.

- **Wat je ziet**: elk Raadslid is een ster met een eigen lijnsymbool, de Koning is de blauwe poolster in het midden. Een routering is een blauwe lichtstraal naar de gekozen ster, met de reden bovenaan. Leest een Raadslid zijn bron, dan pulseert zijn ster en trekt ze deeltjes aan. Elk record-ID in een bericht wordt een gouden ster bij dat Raadslid; noemt een andere Rol hetzelfde ID, dan komt er een gouden lijn. Onderaan dooft per Raadslid-bericht één van de 10 lichtjes (het Beurtenbudget). Geschillen zijn oranje flitslijnen: beslecht wordt goud, onbeslecht blijft flikkeren. In de finale vliegen de bewijssterren naar drie sterrenbeelden (ingreep, mechanisme, verloop; helderheid = zekerheid) en verdwijnt de paarse Desync-glitch. Een deel zonder bewering blijft een donkere, flikkerende vlek.
- **Presentatiemodus**: druk op **P** en de hele run speelt in ongeveer 105 seconden af (instelbaar met `presentatieSeconden`); **R** herstart, **spatie** pauzeert, **← →** gaat per beurt. Elke beurt is een dialoogpaar: bovenaan de vraag van de Koning met zijn reden ("waarom: …"), onderaan de KERN-regel van het Raadslid met zijn record-ID's. Rechts staan de laatste drie beurten, links de open vragen. Na het debat komen de geschillen één voor één, dan het vonnis.
- **Bediening** (rechtsonder): afspelen/pauzeren (spatie), Live (naar het einde en de run volgen), snelheid 1×/2×/0.5×, geluid (standaard uit) en Lite (zonder bloom, nevel en korrel). Met ← → ga je per beurt. Klik op een naam, een kaart, een gouden ster, de open vragen, het budget of een deel van het vonnis om de ruwe trace-beurt te zien.
- **Instellen**: tempo, kleuren en tekstlengtes staan in `visual-stars/src/config.js`.

### Het Kroniekboek starten (3D-visualisatie)

Een 3D pop-upboek op een houten tafel bij kaarslicht (Three.js + GSAP) in `visual-book/`. Net als de andere viewers leest het alleen `trace.json` en `verdict.json`; het schrijft niets en roept geen LLM aan.

```
cd visual-book
npm install
npm run dev
```

Open http://localhost:5174. Start `uv run council` in een tweede terminal om live mee te kijken; een afgeronde run speelt automatisch af. Testdata: http://localhost:5174/?trace=voorbeeld. FPS-teller: `?debug=1`.

- **Wat je ziet**: elke routering spant een gouden draad van de Koning (links) naar het Raadslid dat opklapt (rechts), de reden schrijft zich met de ganzenveer en de open vragen staan in de kantlijn (beantwoorde worden doorgestreept). Elk Raadslid-bericht dooft één van de 10 kaarsen (het Beurtenbudget) en toont de KERN-regel. Elk record-ID wordt een gouden snipper die de paarse scheur dichtlast. Op het einde lichten de naden op, klapt het boek dicht, valt er een zegel en verschijnt het vonnis. Delen zonder bewering blijven gescheurd.
- **Bediening** (rechtsonder): afspelen/pauzeren (spatie), Live, snelheid 0.5×/1×/2×, geluid (standaard uit), Lite (minder effecten) en Vonnis. Met ← → blader je per Raadslid-beurt. Klik op de bevel-, ballon- of vragenkaart, op een figuur of op een hoofdstuk van het vonnis om de ruwe trace-beurt te zien.
- **Eigen figuren**: vervang `visual-book/assets/avatars/<rol>.svg` (en `koning.svg`). Alle tempo's, kleuren, licht en tekstlengtes staan in `visual-book/src/config.js`.

## Hoe de kit werkt

```
             ┌────────────── jouw laptop ──────────────┐
             │  council.py ── Koning (leidt, geen bron)│
   (.env) ──►│      │      ── Raadslid (Oracle) ───────┼──► MCP  /oracle/mcp
             │      │      ── Raadslid (Beast Master) ─┼──► MCP  /beast_master/mcp
             │      ▼                                   │
             │  trace.json + verdict.json ──► viewer    │──► LLM via Roboest-endpoint
             └──────────────────────────────────────────┘
```

| Bestand | Wat |
|---|---|
| `council.py` | De Koning die het debat leidt (`kies_volgende()`, nu een vaste volgorde), het debat zelf en het Verdict van de Koning. Schrijft `trace.json` na elke beurt en `verdict.json` aan het einde. |
| `raadsleden/<rol>.py` | Eén bestand per Raadslid: Rol, naam en publiek perspectief. |
| `rolkaarten.md` | De zes Rolkaarten: perspectief, publiek Belang en soort Kennisbron per Rol. Begin hier om je Rollen te kiezen. |
| `viewer.py` + `viewer.html` | De debatviewer (`uv run viewer`). Leest alleen `trace.json` en `verdict.json`, dus werkt ook als je een ander platform kiest. |
| `voorbeelden/devui_debat.py` | Dezelfde Raadsleden als MAF-group chat in de DevUI van Microsoft (zie "Volgende stappen"). |
| `kennisbronnen/` | Leeg (op een LEESMIJ na). Pak `pack.zip` uit in de root van de repo; dan staan de bronnen in `kennisbronnen/<rol>/`. Staat in `.gitignore`. |
| `schema/` | De JSON-schema's van het Council Verdict en de Debat-trace. |
| `voorbeeld/` | Een ingevuld voorbeeld over een verzonnen zaak (een dorpsmolen), om de vorm te zien. Het valideert bewust niet tegen het Achrona-schema. |
| `validate.py` | Toetst je uitvoer aan de schema's. |

## Wat stel je zelf in?

- **Welke Rollen** meedoen: kopieer `raadsleden/oracle.py` naar bv. `raadsleden/engineer.py` en pas aan: `ROL` = de mapnaam van de Rol in kleine letters (`archmage`, `engineer`, `guardian_keeper`, `historian`, `oracle`, `beast_master`); `NAAM` en `PERSPECTIEF` haal je van de Rolkaart in `rolkaarten.md`. Het nieuwe bestand doet vanzelf mee; de volgorde in het debat is alfabetisch op bestandsnaam. Voeg in `.env` een regel `MCP_<ROL>=https://<mcp-host>/<rol>/mcp` toe.
- **Kennisbronnen**: standaard leest elk Raadslid via MCP. Laat je `MCP_<ROL>` leeg, dan plakt de kit de bestanden uit `kennisbronnen/<rol>/` (uit `pack.zip`) in de prompt van dat Raadslid. Heeft een Raadslid geen van beide, dan meldt de kit dat bij de start.
- **Modellen**: `MODEL_KLEIN` voor de Raadsleden, `MODEL_GROOT` voor de Koning, `REASONING` voor het denkwerk. Op het Roboest-endpoint zijn dat `achrona` en `achrona-groot`. Een andere provider kies je alleen via `.env` (blokken voor het Roboest-endpoint, FreeLLMAPI en Ollama). Met FreeLLMAPI kies je `auto:fast`/`auto:smartest` of een vast model uit de catalogus op http://localhost:3001. Support geven we op het Roboest-endpoint en FreeLLMAPI; andere eigen modellen mogen, zonder support.
- **Rondes**: `RONDES` gold alleen voor de vaste volgorde van de kit en wordt niet meer gebruikt: de Koning kiest zelf. Het Beurtenbudget (10 Raadslid-beurten) geldt altijd.
- **Het debat zelf**: de instructies, wie wie aan het woord laat (`kies_volgende()`), wat elk Raadslid van het debat ziet, en hoe de Koning het Verdict invult. Dat staat allemaal in `council.py`.

**Verbruik**: je teamkey heeft $5 budget en maximaal 60 calls per minuut; dat volstaat voor tientallen volledige runs. Gratis tiers van FreeLLMAPI hebben eigen limieten per provider. De viewer en de terminal tonen per run hoeveel tokens het kleine en het grote model gebruikten; het staat ook in `trace.json` onder `verbruik`. Bij een rate limit (429) wacht de kit en probeert opnieuw. Budget op? Dan geeft het endpoint een fout over het budget: schakel over op FreeLLMAPI (blok 2) of vraag een coach.

## De Koning leidt het debat

`kies_volgende(beurten, leden)` in `council.py` beslist voor elke beurt wie spreekt. De functie krijgt het debat tot nu toe (dezelfde `beurten` als in `trace.json`) en de Raadsleden, en geeft `(rol, vraag, reden)` terug, of `(None, None, reden)` om te stoppen. De kit schrijft elke keuze als `routering`-beurt in de trace (`aan`, `vraag`, `reden`) en stopt zelf na 10 Raadslid-beurten.

Standaard is het een vaste volgorde met `reden: "vaste volgorde"`. Laat jullie Koning beter kiezen: als agent (een LLM die het debat leest), met regels in code, of een mix. Vragen om mee te starten: wie moet een bewering toetsen? Welke Rol ontbreekt nog? Wanneer weet je genoeg? Wat moet elk Raadslid van het debat zien?

### Na je eerste run: waar kijk je naar?

Lees het debat in de viewer zoals een jurylid het zou lezen:

- **Routeringen**: staat er overal `vaste volgorde`? Dan kiest jullie Koning nog niets.
- **Toolcalls**: heeft elk Raadslid zijn Kennisbron gelezen vóór het sprak? Een Raadslid zonder toolcall kan feiten en ID's verzinnen, en de anderen nemen dat over.
- **Open sporen**: welke bewering heeft nog niemand getoetst? Waar spreken Raadsleden elkaar tegen? Naar welke andere Rol verwijst iemand?
- **Verspilde beurten**: wie herhaalt of vat alleen samen wat al gezegd is?
- **Oorzaak**: welke delen (ingreep, mechanisme, verloop) zijn nog onbekend?

Wat je daar ziet, verbeter je in `kies_volgende()`.

### Regels of een agent?

Regels in code zijn een goed begin, maar ze zien geen inhoud: ze herkennen hoogstens een naam in een tekst. Twee Raadsleden die over hetzelfde spreken met andere woorden, merkt een regel niet op. Een Koning als **agent** is meestal sneller gebouwd en kiest beter, omdat hij het debat echt leest.

De vorm:

```
Raadsleden + debat tot nu toe  ──►  LLM (MODEL_GROOT)  ──►  {"rol": ..., "vraag": ..., "reden": ...}
```

Wat je daarvoor uitzoekt: een chat-call naar hetzelfde endpoint als de Raadsleden, een instructie die zegt wat een goede keuze is (en wanneer de Koning stopt), en het antwoord als JSON uitlezen. Zoektermen: *structured output*, *JSON mode*, *group chat manager* of *speaker selection* (MAF). Let op: `kies_volgende()` is gewone, niet-async code, en modellen zetten soms tekst rond hun JSON.

## Spelregels

- Eén Raadslid per Rol. Elk Raadslid leest alleen de Kennisbron van zijn eigen Rol. De viewer en de jury kijken dat na in de trace.
- De Koning leidt het debat en stelt het Verdict op, maar leest zelf geen Kennisbron.
- Maximaal 10 Raadslid-beurten per run (het **Beurtenbudget**). Alleen berichten van Raadsleden tellen; toolcalls, Routeringen en berichten van de Koning niet.
- Vóór elke Raadslid-beurt staat een `routering` in de trace: aan wie, welke vraag en waarom. `spreker` is `koning` (in code of als agent), een Rol (handoff) of `mens`.
- Prompts en code bevatten geen inhoud uit de Kennisbronnen (geen record-ID's of feiten). Wat de Council weet, komt uit het debat.
- Menselijke tussenkomst mag, maar staat in de trace als `spreker: "mens"`. Een Routering door een mens telt niet mee voor de Council-score.
- `trace.json` is de ongewijzigde uitvoer van de run die het Verdict maakte. Niet achteraf bewerken.
- Elke Rol heeft een Belang en kan ernaast zitten.

## Wat moet je zelf bouwen?

- Een **Koning** die het debat leidt in plaats van de vaste volgorde, met een reden bij elke keuze.
- Meer Raadsleden (minstens 3 Rollen). Meer Rollen geven meer kennis, maar elke beurt telt. De Kennisbronnen verwijzen soms naar andere Rollen: dat zegt je welke Rol je nog mist.
- Een Koning die het `verdict.json` echt invult: de oorzaak in drie delen (`ingreep`, `mechanisme`, `verloop`), elk met een bewering en record-ID's als bewijs, een geordend herstelplan (`acties`) en minstens één risico. Weet je een deel niet, laat dan `bewering: null`.
- `geschillen` in de trace: waarover waren de Raadsleden het oneens, en hoe werd het beslecht?
- Let op: modellen schrijven ID's soms met een speciaal koppelteken (`ORA‑101`). `uv run validate` meldt dat; vervang het door een gewoon `-`.

## Jurering

Drie criteria, elk 0–10: **Verdict** (40%), **Council** (40%: hoe goed orchestreert jullie Council, zichtbaar in de Routeringen van de trace) en **Presentatie** (20%, met de vraag: waarom werkt jullie Council hier beter dan één agent?). Zonder Extra uitdaging haal je per criterium hoogstens 8 op 10. Voor wie sneller klaar is:

- **Verdict**: voorspel wanneer de Desync opnieuw toeslaat als niemand ingrijpt (optioneel veld `voorspelling {dag, bewering, bewijs[]}`) · geef je zekerheid per deel van de oorzaak (optioneel veld `zekerheid`, 0–1, per slot).
- **Council**: laat je Koning zelf beslissen wanneer het debat klaar is, en waarom (een `routering` met `aan: null` vóór het budget op is) · laat je Koning een lijst open vragen bijhouden en na elke beurt bijwerken (optioneel veld `open_vragen` in de `routering`).
- **Presentatie**: draai de Council live tijdens de pitch · bouw een eigen, rijkere visualisatie van het debat (bovenop of in plaats van de viewer) of geef de Rollen avatars.

## Volgende stappen

- **DevUI**: `uv run --extra devui python voorbeelden/devui_debat.py` opent de DevUI van [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) met dezelfde Raadsleden als group chat. Het gebruikt de bestanden uit `kennisbronnen/<rol>/` (geen MCP: pak eerst `pack.zip` uit) en schrijft geen trace. Handig om orchestratie te verkennen.
- MAF heeft patronen voor orchestratie: een group chat met een manager die de spreker kiest, Handoff (een agent geeft het woord door) en Magentic (een manager met een plan en open vragen). Gebruik ze, of kies een eigen platform: zolang je `verdict.json` en `trace.json` in dit formaat oplevert, met een `routering` vóór elke Raadslid-beurt, mag alles.
- Bouw RAG op de Kennisbronnen: het Roboest-endpoint biedt geen embeddings aan, FreeLLMAPI wel (`/v1/embeddings`).

## Inleveren (om 16:00)

- Je repo is **openbaar** en je deelt de link met ons via het inleverformulier (link bij de briefing).
- Commit en push `verdict.json` en `trace.json` (in de root, uit dezelfde run) vóór 16:00. Alleen de laatste commit vóór 16:00 telt.
- Kleine correcties aan `verdict.json` (bv. koppeltekens) mogen; `trace.json` laat je ongewijzigd.

## Licentie

MIT, zie `LICENSE`.
