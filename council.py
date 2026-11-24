"""Council of Achrona: een Council met Raadsleden en een Koning die het debat leidt.

Start met `uv run council`. Schrijft verdict.json en trace.json in de root van de repo.
De Koning is een LLM-agent (MODEL_GROOT): in `kies_volgende()` leest hij het debat en kiest hij wie spreekt,
met welke vraag en waarom; op het einde stelt hij het Verdict en de geschillen op.
Prompts en code bevatten bewust geen inhoud uit de Kennisbronnen: wat de Council weet, komt uit het debat.
"""
import asyncio
import json
import os
import re
import sys
import uuid
from contextlib import AsyncExitStack
from datetime import datetime
from pathlib import Path

from agent_framework import Agent, MCPStreamableHTTPTool
from agent_framework.openai import OpenAIChatCompletionClient
from dotenv import load_dotenv
from jsonschema import Draft202012Validator
from openai import AsyncOpenAI, BadRequestError, OpenAI

import raadsleden

ROOT = Path(__file__).parent
KENNISBRONNEN = ROOT / "kennisbronnen"
ROLLEN = ("archmage", "engineer", "guardian_keeper", "historian", "oracle", "beast_master")
BEURTENBUDGET = 10  # spelregel: maximaal 10 Raadslid-beurten (berichten van Raadsleden) per run
MIN_BEURTEN = 5  # de Koning mag pas zelf stoppen na zoveel Raadslid-beurten
MAX_OPEN_VRAGEN = 6
ID_PATROON = re.compile(r"\b(?:ARC|ENG|GUA|HIS|ORA|BEA)-[0-9]{3}\b")
RARE_STREEP = re.compile("(ARC|ENG|GUA|HIS|ORA|BEA)[‐‑‒–—―−]([0-9]{3})")
SLOTS = ("ingreep", "mechanisme", "verloop")

VERBRUIK = {}  # tokens per model, komt in trace.json onder "verbruik"


# --------------------------------------------------------------------------- hulpjes

def normaliseer(tekst):
    """Speciale koppeltekens in record-ID's (bv. ORA‑101) worden een gewoon '-'."""
    return RARE_STREEP.sub(r"\1-\2", tekst or "")


def ids_in(tekst):
    return ID_PATROON.findall(normaliseer(tekst))


def lees_json(tekst):
    """Het eerste JSON-object uit een modelantwoord, ook als er tekst of ```json omheen staat. None als er geen is."""
    if not tekst:
        return None
    try:
        data = json.loads(tekst)
        return data if isinstance(data, dict) else None
    except ValueError:
        pass
    decoder = json.JSONDecoder()
    for i, teken in enumerate(tekst):
        if teken == "{":
            try:
                data, _ = decoder.raw_decode(tekst, i)
            except ValueError:
                continue
            if isinstance(data, dict):
                return data
    return None


def tel(verbruik, model, usage):
    if not usage:
        return
    v = verbruik.setdefault(model, {"beurten": 0, "invoer": 0, "gecached": 0, "uitvoer": 0})
    v["beurten"] += 1  # één beurt = één agent-run of één Koning-call
    v["invoer"] += usage.get("input_token_count") or 0
    v["gecached"] += usage.get("cache_read_input_token_count") or 0
    v["uitvoer"] += usage.get("output_token_count") or 0


def koning_chat(systeem, gebruiker):
    """Eén gewone (niet-async) chat-call van de Koning naar MODEL_GROOT. Geeft de tekst van het antwoord terug."""
    client = OpenAI(base_url=os.environ["OPENAI_BASE_URL"], api_key=os.environ["OPENAI_API_KEY"], max_retries=8)
    kwargs = {
        "model": os.environ["MODEL_GROOT"],
        "messages": [{"role": "system", "content": systeem}, {"role": "user", "content": gebruiker}],
    }
    if os.getenv("REASONING"):
        kwargs["reasoning_effort"] = os.environ["REASONING"]
    try:
        r = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
    except BadRequestError:  # niet elke provider achter het endpoint kent JSON mode: dan zonder
        r = client.chat.completions.create(**kwargs)
    if r.usage:
        details = getattr(r.usage, "prompt_tokens_details", None)
        tel(VERBRUIK, "groot", {
            "input_token_count": r.usage.prompt_tokens,
            "output_token_count": r.usage.completion_tokens,
            "cache_read_input_token_count": getattr(details, "cached_tokens", 0) if details else 0,
        })
    return r.choices[0].message.content or ""


def namen(leden):
    return {l.ROL: l.NAAM for l in leden}


def debat_tekst(beurten, leden):
    """Het debat tot nu toe, zoals de Koning het ziet: vragen, wie zijn bron raadpleegde, en wat er gezegd werd."""
    naam = namen(leden)
    regels = []
    for b in beurten:
        if b["soort"] == "routering" and b.get("aan"):
            regels.append(f"[Koning → {naam.get(b['aan'], b['aan'])}] {b.get('vraag')}")
        elif b["soort"] == "toolcall":
            regels.append(f"   ({naam.get(b['spreker'], b['spreker'])} raadpleegt zijn Kennisbron met '{b.get('tool')}')")
        elif b["soort"] == "bericht" and b["spreker"] in naam:
            regels.append(f"{naam[b['spreker']]} ({b['spreker']}): {b.get('tekst')}")
        elif b["soort"] == "bericht" and b["spreker"] == "mens":
            regels.append(f"Mens: {b.get('tekst')}")
    return "\n\n".join(regels) or "(het debat is nog niet begonnen)"


def leden_tekst(leden):
    return "\n".join(f"- {l.ROL}: {l.NAAM}. {l.PERSPECTIEF}" for l in leden)


# --------------------------------------------------------------------------- de Koning leidt het debat

KONING_ROUTERING = f"""Je bent de Koning van de Council of Achrona en je leidt het debat als een onderzoeksrechter.
Je leest zelf geen Kennisbron: je weet alleen wat de Raadsleden in het debat inbrachten.

Het doel: de oorzaak van de Desync achterhalen, in drie delen:
- ingreep: wie deed wat, en wanneer;
- mechanisme: hoe leidt dat tot de symptomen;
- verloop: welk patroon in de tijd (wanneer, hoe vaak, wat komt er nog).

Wat je weet over de Raadsleden:
- elk Raadslid kent alleen zijn eigen Kennisbron, en dus maar een stuk van het verhaal;
- elk Raadslid heeft een Belang en kan ernaast zitten, iets verzwijgen of de schuld bij een ander leggen;
- een bewering telt alleen met record-ID's; een conclusie zonder bewijs is een vermoeden;
- er zijn maximaal {BEURTENBUDGET} Raadslid-beurten. Elke beurt is kostbaar.

Kies wie nu spreekt en met welke vraag. Goede keuzes:
- een Rol wiens kennis nog ontbreekt, zeker als iemand naar die Rol of naar iets uit diens domein verwijst;
- iemand die een bewering van een ander kan toetsen of weerleggen met zijn eigen bron;
- bij tegenspraak: confronteer een Raadslid met de concrete bewering en ID's van een ander;
- een gerichte vraag naar een ontbrekend deel van de oorzaak, of naar exacte dagen en tijdstippen om een patroon te zien;
- geen beurt verspillen aan samenvatten of herhalen; hetzelfde Raadslid niet twee keer na elkaar zonder goede reden.
Stel een concrete vraag (nooit 'geef je inbreng') en vraag altijd om record-ID's.

Stop zelf (rol null) zodra de drie delen met bewijs onderbouwd zijn en de belangrijkste tegenspraak beslecht is,
of als nieuwe beurten niets meer toevoegen.

Antwoord met alleen JSON, zonder tekst eromheen:
{{"rol": "<rol uit de lijst, of null om te stoppen>", "vraag": "<je vraag, of null>",
 "reden": "<waarom deze keuze: welke bewering, welke tegenspraak, welk ontbrekend deel; concreet>",
 "open_vragen": ["<korte open vraag>", "..."]}}
Houd open_vragen bij: wat is na deze keuze nog onbeantwoord (hoogstens {MAX_OPEN_VRAGEN}, kort)."""


def kies_volgende(beurten, leden):
    """De Koning leidt het debat: hij beslist wie spreekt. De kit roept deze functie op vóór elke beurt.

    Geeft (rol, vraag, reden, open_vragen) terug, of (None, None, reden, open_vragen) om te stoppen.
    De Koning is een LLM-agent; lukt zijn antwoord niet, dan kiest een eenvoudige regel (fallback),
    en dat staat dan ook zo in de reden.
    """
    rollen = [l.ROL for l in leden]
    naam = namen(leden)
    gesproken = [b["spreker"] for b in beurten if b["soort"] == "bericht" and b["spreker"] in rollen]
    over = BEURTENBUDGET - len(gesproken)
    vorige_open = next((b["open_vragen"] for b in reversed(beurten)
                        if b["soort"] == "routering" and b.get("open_vragen")), [])

    vraag_aan_koning = (
        f"Raadsleden:\n{leden_tekst(leden)}\n\n"
        f"Nog niet gesproken: {', '.join(r for r in rollen if r not in gesproken) or 'iedereen sprak al'}\n"
        f"Raadslid-beurten gebruikt: {len(gesproken)} van {BEURTENBUDGET} (nog {over}).\n"
        f"Stoppen kan pas na {MIN_BEURTEN} Raadslid-beurten.\n"
        f"Jouw open vragen tot nu toe: {json.dumps(vorige_open, ensure_ascii=False)}\n\n"
        f"Debat tot nu toe:\n\n{debat_tekst(beurten, leden)}"
    )
    probleem = None
    try:
        antwoord = lees_json(koning_chat(KONING_ROUTERING, vraag_aan_koning))
    except Exception as e:  # netwerk, budget, ...: het debat moet niet crashen op één keuze
        antwoord, probleem = None, f"Koning-call mislukte ({type(e).__name__})"

    if antwoord is None:
        probleem = probleem or "antwoord van de Koning was geen leesbare JSON"
    else:
        rol = antwoord.get("rol")
        rol = None if rol in (None, "", "null", "none", "None") else str(rol).strip().lower()
        vraag = (antwoord.get("vraag") or "").strip() or None
        reden = (antwoord.get("reden") or "").strip()
        open_vragen = antwoord.get("open_vragen")
        open_vragen = ([str(v).strip() for v in open_vragen if str(v).strip()][:MAX_OPEN_VRAGEN]
                       if isinstance(open_vragen, list) else vorige_open)
        if rol is None:
            if len(gesproken) >= MIN_BEURTEN:
                return None, None, reden or "De Koning weet genoeg.", open_vragen
            probleem = f"de Koning wilde al stoppen na {len(gesproken)} beurten (minimum {MIN_BEURTEN})"
        elif rol not in rollen:
            probleem = f"de Koning koos een onbekende Rol ({rol!r})"
        elif not vraag or not reden:
            probleem = "de Koning gaf geen vraag of reden"
        else:
            return rol, vraag, reden, open_vragen

    # Fallback: wie nog niet sprak, anders wie het langst geleden sprak.
    nog_niet = [r for r in rollen if r not in gesproken]
    if nog_niet:
        rol = nog_niet[0]
        waarom = f"{naam[rol]} heeft nog niet gesproken"
    else:
        rol = min(rollen, key=lambda r: max(i for i, s in enumerate(gesproken) if s == r))
        waarom = f"{naam[rol]} sprak het langst geleden"
    vraag = ("Raadpleeg je Kennisbron en vertel wat jouw bron zegt over de oorzaak van de Desync. "
             "Toets ook de beweringen van de anderen. Noem exacte record-ID's.")
    return rol, vraag, f"fallback ({probleem}): {waarom}", vorige_open


# --------------------------------------------------------------------------- de Raadsleden

def instructies(lid, bestanden, mcp):
    tekst = (
        f"Je bent de {lid.NAAM}, een Raadslid in de Council of Achrona. {lid.PERSPECTIEF}\n"
        "De Council onderzoekt de oorzaak van de Desync. De Koning leidt het debat en stelt jou telkens een vraag.\n\n"
        "Werkwijze, elke beurt opnieuw:\n"
        "1. Raadpleeg EERST je Kennisbron, ook als je denkt het antwoord al te kennen.\n"
        "2. Beantwoord dan de vraag van de Koning, in hoogstens 150 woorden.\n"
        "3. Noem bij elke bewering de record-ID's precies zoals ze in je Kennisbron staan, tussen haakjes. "
        "Verzin nooit een ID, en gebruik geen ID's van een ander Raadslid als jouw bewijs.\n"
        "4. Geef concrete dagen en tijdstippen als je bron die heeft.\n"
        "5. Spreekt je bron een ander Raadslid tegen, zeg dat duidelijk, met je ID's. "
        "Verwijst je bron naar een andere Rol, vermeld dat.\n"
        "6. Staat iets niet in je bron, zeg dat eerlijk. Onderscheid wat je bron vastlegt van wat jij ervan denkt."
    )
    if mcp:
        tekst += ("\n\nJe Kennisbron lees je met je tools: zoek, zoek_betekenis (op betekenis), "
                  "toon (records op ID) en lees_kennisbron (alles).")
    elif bestanden:
        tekst += "\n\nJe Kennisbron:\n\n" + "\n\n".join(f"## {p.name}\n\n{p.read_text(encoding='utf-8')}" for p in bestanden)
    else:
        tekst += "\n\nJe hebt nog geen Kennisbron: zeg dat je niets kan bewijzen."
    return tekst


def client(model_env):
    return OpenAIChatCompletionClient(
        model=os.environ[model_env],
        async_client=AsyncOpenAI(
            base_url=os.environ["OPENAI_BASE_URL"],
            api_key=os.environ["OPENAI_API_KEY"],
            max_retries=8,  # bij een rate limit (429) wacht de client en probeert opnieuw
        ),
    )


def kennisbron_bestanden(rol):
    map_ = KENNISBRONNEN / rol
    return sorted(p for p in map_.glob("*") if p.suffix in (".md", ".csv")) if map_.is_dir() else []


def toolcalls(response):
    for msg in response.messages:
        for c in msg.contents:
            if c.type == "function_call":
                args = c.arguments
                yield c.name, json.loads(args) if isinstance(args, str) and args else (args or {})


# --------------------------------------------------------------------------- het Verdict

KONING_VERDICT = """Je bent de Koning van de Council of Achrona. Het debat is voorbij. Je leest zelf geen Kennisbron:
je baseert je alleen op wat de Raadsleden in het debat zeiden, met hun record-ID's.

Stel het Council Verdict en de lijst geschillen op. Regels:
- gebruik alleen record-ID's die een Raadslid in het debat noemde, en alleen bij een bewering die ze ook echt ondersteunen;
- de oorzaak heeft drie delen: ingreep (wie deed wat, wanneer), mechanisme (hoe leidt dat tot de symptomen),
  verloop (welk patroon in de tijd). Is een deel niet onderbouwd, zet dan "bewering": null en "bewijs": [];
- zekerheid per deel: een getal van 0 tot 1, eerlijk (hoeveel onafhankelijke bronnen bevestigen het, was er tegenspraak?);
- weeg af: elk Raadslid heeft een Belang en kan ernaast zitten. Kies de verklaring die het meeste bewijs uit
  verschillende bronnen verklaart, niet de luidste;
- acties: een geordend herstelplan, in uitvoeringsvolgorde, met een reden per actie. Denk na over wat een maatregel
  kan kapotmaken voor je hem voorstelt;
- risicos: minstens één, met mitigatie;
- voorspelling: alleen als het patroon het toelaat: op welke dag slaat de Desync opnieuw toe als niemand ingrijpt? Anders null;
- geschillen: waarover waren Raadsleden het oneens? Per geschil het onderwerp, het standpunt per Rol (sleutel = rol),
  de uitkomst (wie had gelijk, waarom) en het bewijs. Uitkomst null als het niet beslecht werd.

Antwoord met alleen JSON, zonder tekst eromheen, in deze vorm:
{"samenvatting": "<2-4 zinnen>",
 "oorzaak": {"ingreep": {"bewering": "<tekst of null>", "bewijs": ["<ID>"], "zekerheid": 0.0},
             "mechanisme": {"bewering": "...", "bewijs": ["..."], "zekerheid": 0.0},
             "verloop": {"bewering": "...", "bewijs": ["..."], "zekerheid": 0.0}},
 "acties": [{"actie": "...", "reden": "...", "bewijs": ["..."]}],
 "risicos": [{"risico": "...", "mitigatie": "..."}],
 "voorspelling": {"dag": 0, "bewering": "...", "bewijs": ["..."]},
 "geschillen": [{"onderwerp": "...", "standpunten": {"<rol>": "..."}, "uitkomst": "<tekst of null>", "bewijs": ["..."]}]}"""


def schone_ids(lijst, toegestaan):
    """Alleen geldige ID's die een Raadslid in het debat noemde, zonder dubbels."""
    uit = []
    for x in lijst if isinstance(lijst, list) else []:
        i = normaliseer(str(x)).strip()
        if ID_PATROON.fullmatch(i) and i in toegestaan and i not in uit:
            uit.append(i)
    return uit


def tekst_of_none(x):
    return x.strip() if isinstance(x, str) and x.strip() and x.strip().lower() != "null" else None


def maak_verdict(data, run_id, toegestaan):
    """Bouwt een schone verdict-dict uit het modelantwoord. Bewijs dat niet in het debat viel, valt weg."""
    data = data if isinstance(data, dict) else {}
    oorzaak_in = data.get("oorzaak") if isinstance(data.get("oorzaak"), dict) else {}
    oorzaak = {}
    for slot in SLOTS:
        s = oorzaak_in.get(slot) if isinstance(oorzaak_in.get(slot), dict) else {}
        bewering, bewijs = tekst_of_none(s.get("bewering")), schone_ids(s.get("bewijs"), toegestaan)
        if not bewijs:  # een bewering zonder bewijs uit het debat is een vermoeden: eerlijk onbekend
            bewering = None
        deel = {"bewering": bewering, "bewijs": bewijs if bewering else []}
        if bewering and isinstance(s.get("zekerheid"), (int, float)):
            deel["zekerheid"] = round(min(1.0, max(0.0, float(s["zekerheid"]))), 2)
        oorzaak[slot] = deel

    acties = []
    for a in data.get("acties") or []:
        if isinstance(a, dict) and tekst_of_none(a.get("actie")) and tekst_of_none(a.get("reden")):
            actie = {"actie": tekst_of_none(a["actie"]), "reden": tekst_of_none(a["reden"])}
            if schone_ids(a.get("bewijs"), toegestaan):
                actie["bewijs"] = schone_ids(a.get("bewijs"), toegestaan)
            acties.append(actie)
    risicos = [{"risico": tekst_of_none(r["risico"]), "mitigatie": tekst_of_none(r["mitigatie"])}
               for r in data.get("risicos") or []
               if isinstance(r, dict) and tekst_of_none(r.get("risico")) and tekst_of_none(r.get("mitigatie"))]

    verdict = {
        "run_id": run_id,
        "samenvatting": tekst_of_none(data.get("samenvatting")) or "De Council kwam niet tot een samenvatting.",
        "oorzaak": oorzaak,
        "acties": acties or [{"actie": "Het onderzoek voortzetten met de Rollen die nog niet gehoord zijn.",
                              "reden": "Het debat leverde geen onderbouwd herstelplan op."}],
        "risicos": risicos or [{"risico": "De oorzaak is niet volledig vastgesteld.",
                                "mitigatie": "Geen ingrijpende maatregelen nemen voor ze met bewijs onderbouwd zijn."}],
    }
    v = data.get("voorspelling")
    if isinstance(v, dict) and tekst_of_none(v.get("bewering")):
        try:
            dag = int(v.get("dag"))
        except (TypeError, ValueError):
            dag = 0
        if dag >= 1:
            verdict["voorspelling"] = {"dag": dag, "bewering": tekst_of_none(v["bewering"]),
                                       "bewijs": schone_ids(v.get("bewijs"), toegestaan)}
    return verdict


def maak_geschillen(data, toegestaan, rollen):
    geschillen = []
    for g in (data or {}).get("geschillen") or []:
        if not isinstance(g, dict) or not tekst_of_none(g.get("onderwerp")):
            continue
        standpunten = {str(r).strip().lower(): str(t).strip()
                       for r, t in (g.get("standpunten") or {}).items()
                       if str(r).strip().lower() in rollen and str(t).strip()} if isinstance(g.get("standpunten"), dict) else {}
        if not standpunten:
            continue
        bewijs = schone_ids(g.get("bewijs"), toegestaan)
        uitkomst = tekst_of_none(g.get("uitkomst"))
        geschil = {"onderwerp": tekst_of_none(g["onderwerp"]), "standpunten": standpunten,
                   "uitkomst": uitkomst if bewijs else None, "bewijs": bewijs}
        if uitkomst and not bewijs:  # zonder bewijs geldt het geschil als niet beslecht; de mening van de Koning blijft zichtbaar
            geschil["toelichting"] = uitkomst
        geschillen.append(geschil)
    return geschillen


def schema_fouten(naam, data):
    schema = json.loads((ROOT / "schema" / naam).read_text(encoding="utf-8"))
    return [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
            for e in Draft202012Validator(schema).iter_errors(data)]


def stel_verdict_op(beurten, leden, run_id):
    """Eén Koning-call voor Verdict en geschillen samen; bij schemafouten één herkansing; daarna een veilige fallback."""
    rollen = [l.ROL for l in leden]
    toegestaan = {i for b in beurten if b["soort"] == "bericht" and b["spreker"] in rollen for i in ids_in(b.get("tekst"))}
    vraag = (f"Raadsleden:\n{leden_tekst(leden)}\n\n"
             f"Record-ID's die in het debat genoemd werden: {', '.join(sorted(toegestaan)) or '(geen)'}\n\n"
             f"Debat:\n\n{debat_tekst(beurten, leden)}")
    data, fouten = None, []
    for poging in range(2):
        try:
            extra = "" if not fouten else ("\n\nJe vorige antwoord was ongeldig:\n- " + "\n- ".join(fouten[:10])
                                           + "\nGeef het volledige JSON-antwoord opnieuw, verbeterd.")
            data = lees_json(normaliseer(koning_chat(KONING_VERDICT, vraag + extra)))
        except Exception as e:
            print(f"Verdict-call mislukte: {type(e).__name__}: {e}")
            data = None
        if data is None:
            fouten = ["het antwoord was geen leesbare JSON"]
            continue
        verdict = maak_verdict(data, run_id, toegestaan)
        geschillen = maak_geschillen(data, toegestaan, rollen)
        fouten = schema_fouten("verdict.json", verdict)
        if not fouten:
            return verdict, geschillen
    print("LET OP: de Koning gaf geen geldig Verdict; een eerlijk, leeg Verdict wordt geschreven.")
    return maak_verdict(data or {}, run_id, toegestaan), maak_geschillen(data, toegestaan, rollen)


# --------------------------------------------------------------------------- het debat

def controleer(leden):
    """Duidelijke melding in plaats van een traceback bij de meest voorkomende fouten."""
    mist = [v for v in ("OPENAI_BASE_URL", "OPENAI_API_KEY", "MODEL_KLEIN", "MODEL_GROOT") if not os.getenv(v)]
    if mist:
        sys.exit(f"In .env ontbreekt: {', '.join(mist)}. Kopieer .env.example naar .env en vul het in, of zie 'Vooraf installeren' in de README.")
    for lid in leden:
        if lid.ROL not in ROLLEN:
            sys.exit(f"raadsleden/: ROL = {lid.ROL!r} is ongeldig. Gebruik de mapnaam van de Rol: {', '.join(ROLLEN)}.")
    dubbel = {l.ROL for l in leden if [x.ROL for x in leden].count(l.ROL) > 1}
    if dubbel:
        sys.exit(f"Eén Raadslid per Rol: {', '.join(dubbel)} komt meer dan eens voor in raadsleden/.")


async def run():
    load_dotenv(ROOT / ".env")
    opties = {"reasoning_effort": os.environ["REASONING"]} if os.getenv("REASONING") else None  # minder denkwerk = minder tokens
    run_id = f"{datetime.now().astimezone().isoformat(timespec='seconds')}_{uuid.uuid4().hex[:8]}"
    leden = raadsleden.alle()
    controleer(leden)
    beurten = []
    VERBRUIK.clear()
    trace = {"run_id": run_id, "status": "bezig", "raadsleden": [l.ROL for l in leden], "beurten": beurten,
             "geschillen": [], "verbruik": VERBRUIK}

    def bewaar(naam, data):
        (ROOT / naam).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    def beurt(ronde, spreker, soort, **velden):
        beurten.append({"nr": len(beurten) + 1, "ronde": ronde, "spreker": spreker, "soort": soort, **velden})
        bewaar("trace.json", trace)  # na elke beurt: de viewer (`uv run viewer`) toont het debat live

    klein = client("MODEL_KLEIN")

    async with AsyncExitStack() as stack:
        agents = []
        for lid in leden:
            mcp_url = os.getenv(f"MCP_{lid.ROL.upper()}", "").strip()
            bestanden = [] if mcp_url else kennisbron_bestanden(lid.ROL)
            tools = []
            if mcp_url:
                try:
                    tools.append(await stack.enter_async_context(MCPStreamableHTTPTool(name=f"kennisbron_{lid.ROL}", url=mcp_url)))
                except Exception as e:
                    sys.exit(f"MCP voor {lid.NAAM} ({mcp_url}) is onbereikbaar: {e}\n"
                             f"Klopt het pad /{lid.ROL}/mcp? "
                             f"Of laat MCP_{lid.ROL.upper()} leeg om de bestanden uit kennisbronnen/{lid.ROL}/ te gebruiken.")
            elif not bestanden:
                print(f"LET OP: {lid.NAAM} heeft geen Kennisbron (MCP_{lid.ROL.upper()} is leeg en kennisbronnen/{lid.ROL}/ ook).")
            for p in bestanden:  # fallback zonder MCP: welke bestanden gingen in de prompt
                beurt(0, lid.ROL, "bestand", bestand=f"{lid.ROL}/{p.name}")
            agents.append((lid, mcp_url, Agent(klein, instructies(lid, bestanden, mcp_url), name=lid.ROL, tools=tools)))

        (ROOT / "verdict.json").unlink(missing_ok=True)  # setup gelukt: geen Verdict van een vorige run laten staan
        bewaar("trace.json", trace)
        per_rol = {lid.ROL: (lid, mcp_url, agent) for lid, mcp_url, agent in agents}
        ronde = 1
        while True:
            gesproken = sum(1 for b in beurten if b["soort"] == "bericht" and b["spreker"] in per_rol)
            if gesproken >= BEURTENBUDGET:
                rol, vraag, reden, open_vragen = None, None, f"Beurtenbudget op ({BEURTENBUDGET} Raadslid-beurten)", None
            else:
                trace["aan_het_woord"] = "koning"
                bewaar("trace.json", trace)
                rol, vraag, reden, open_vragen = await asyncio.to_thread(kies_volgende, beurten, leden)
            if rol is not None and rol not in per_rol:
                sys.exit(f"kies_volgende() koos {rol!r}, maar die Rol zit niet in raadsleden/.")
            if rol is not None:
                ronde = gesproken // len(leden) + 1
            # Elke keuze van de Koning staat in de trace: aan wie, welke vraag, waarom en wat nog open is.
            extra = {"open_vragen": open_vragen} if open_vragen is not None else {}
            beurt(ronde, "koning", "routering", aan=rol, vraag=vraag, reden=reden, **extra)
            print(f"\n[Koning] {'stopt' if rol is None else '→ ' + per_rol[rol][0].NAAM}: {reden}")
            if rol is None:
                break
            lid, mcp_url, agent = per_rol[rol]
            # Wie ziet wat? Elk Raadslid ziet het hele debat (broadcast) en de vraag van de Koning aan hem.
            prompt = f"Debat tot nu toe:\n\n{debat_tekst(beurten[:-1], leden)}\n\nVraag van de Koning aan jou: {vraag}"
            trace["aan_het_woord"] = rol
            bewaar("trace.json", trace)
            r = await agent.run(prompt, options=opties)
            tel(VERBRUIK, "klein", r.usage_details)
            calls = list(toolcalls(r))
            if mcp_url and not calls:  # zonder toolcall kan een Raadslid feiten verzinnen: één herkansing
                print(f"   ({lid.NAAM} las zijn bron niet: herkansing)")
                r = await agent.run(prompt + "\n\nLET OP: raadpleeg eerst je Kennisbron met je tools, en antwoord pas daarna.",
                                    options=opties)
                tel(VERBRUIK, "klein", r.usage_details)
                calls = list(toolcalls(r))
            for tool, args in calls:
                beurt(ronde, rol, "toolcall", tool=tool, argumenten=args, pad=mcp_url)
            beurt(ronde, rol, "bericht", tekst=r.text)
            print(f"\n[ronde {ronde}] {lid.NAAM}:\n{r.text}")

    # De Koning heeft geen Rol en geen Kennisbron: hij kent alleen wat de Raadsleden inbrachten.
    trace["aan_het_woord"] = "koning"
    bewaar("trace.json", trace)
    verdict, geschillen = await asyncio.to_thread(stel_verdict_op, beurten, leden, run_id)
    trace["geschillen"] = geschillen
    beurt(ronde + 1, "koning", "bericht", tekst=verdict["samenvatting"])
    print(f"\n[Koning]:\n{verdict['samenvatting']}")

    trace["status"], trace["aan_het_woord"] = "klaar", None
    bewaar("trace.json", trace)
    bewaar("verdict.json", verdict)

    print(f"\nKlaar: verdict.json en trace.json geschreven (run_id {run_id}).")
    for model, v in VERBRUIK.items():
        print(f"Verbruik {model}: {v['beurten']} beurten, {v['invoer']} tokens in ({v['gecached']} gecached), {v['uitvoer']} tokens uit")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(run())


if __name__ == "__main__":
    main()
