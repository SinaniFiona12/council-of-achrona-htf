"""Offline test van council.py: geen enkele API-call, kost dus geen budget. Start met `uv run python tests/test_offline.py`."""
import json, sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import council, raadsleden, validate
from types import SimpleNamespace as NS

leden = raadsleden.alle()
fouten = 0
def check(naam, ok):
    global fouten
    print(("OK  " if ok else "FOUT"), naam); fouten += (not ok)

# lees_json
check("json met tekst eromheen", council.lees_json('Zeker! ```json\n{"rol": "engineer", "x": {"a": 1}}\n``` klaar') == {"rol": "engineer", "x": {"a": 1}})
check("geen json -> None", council.lees_json("geen idee") is None)
check("koppeltekens", council.normaliseer("zie ENG‑901 en HIS–903") == "zie ENG-901 en HIS-903")

# kies_volgende met nep-antwoorden
def met(antwoord, beurten):
    council.koning_chat = (lambda s, g: (_ for _ in ()).throw(RuntimeError("weg"))) if antwoord is Exception else (lambda s, g: antwoord)
    return council.kies_volgende(beurten, leden)
leeg = []
r = met('{"rol": "historian", "vraag": "Wat zegt het archief?", "reden": "nog niet gehoord", "open_vragen": ["wie?"]}', leeg)
check("geldige keuze", r == ("historian", "Wat zegt het archief?", "nog niet gehoord", ["wie?"]))
r = met("blabla", leeg); check("onleesbaar -> fallback", r[0] == "archmage" and r[2].startswith("fallback"))
r = met(Exception, leeg); check("call faalt -> fallback", r[0] == "archmage" and "mislukte" in r[2])
antwoorden = iter(["onzin", '{"rol": "oracle", "vraag": "v?", "reden": "r.", "open_vragen": []}'])
council.koning_chat = lambda s, g: next(antwoorden)
r = council.kies_volgende(leeg, leden); check("herkansing na ongeldige JSON", r[0] == "oracle")
check("Belang zichtbaar voor de Koning", all(getattr(l, "BELANG", "") for l in leden) and "Publiek Belang" in council.leden_tekst(leden))
check("KERN-regel in instructies", "KERN:" in council.instructies(leden[0], [], "mcp"))
r = met('{"rol": "koning", "vraag": "x", "reden": "y"}', leeg); check("onbekende rol -> fallback", r[2].startswith("fallback"))
r = met('{"rol": null, "vraag": null, "reden": "genoeg"}', leeg); check("te vroeg stoppen -> fallback", r[0] is not None)
vijf = [{"soort": "bericht", "spreker": l.ROL, "tekst": "t"} for l in leden[:5]]
r = met('{"rol": null, "vraag": null, "reden": "genoeg", "open_vragen": []}', vijf); check("stoppen na 5 mag", r[0] is None and r[2] == "genoeg")
r = met("x", [{"soort": "bericht", "spreker": l.ROL, "tekst": "t"} for l in leden]); check("fallback als iedereen sprak", r[0] == "archmage")

# de Koning krijgt te horen wanneer zijn laatste keuze eraan komt en wanneer beurten niets nieuws brachten
gezien = {}
council.koning_chat = lambda s, g: gezien.update(g=g) or '{"rol": null, "vraag": null, "reden": "genoeg", "open_vragen": []}'
negen = [{"soort": "bericht", "spreker": leden[i % len(leden)].ROL, "tekst": "t"} for i in range(9)]
r = council.kies_volgende(negen, leden)
check("laatste keuze gemeld", r[0] is None and "laatste keuze" in gezien["g"])
check("niets nieuws gemeld", "geen nieuwe record-ID" in gezien["g"])

# verdict + geschillen
debat = [
 {"soort": "routering", "spreker": "koning", "aan": "engineer"},
 {"soort": "bericht", "spreker": "engineer", "tekst": "Ik deed X (ENG‑901, ENG-902)."},
 {"soort": "bericht", "spreker": "historian", "tekst": "Het archief zegt Y (HIS-903)."},
]
antwoord = json.dumps({
 "samenvatting": "Samenvatting.",
 "oorzaak": {"ingreep": {"bewering": "X", "bewijs": ["ENG-901", "ENG-905"], "zekerheid": 1.4},
             "mechanisme": {"bewering": "Y", "bewijs": ["ARC-904"], "zekerheid": 0.5},
             "verloop": {"bewering": None, "bewijs": []}},
 "acties": [{"actie": "A", "reden": "R", "bewijs": ["HIS-903"]}, {"actie": "", "reden": "x"}],
 "risicos": [{"risico": "Z", "mitigatie": "M"}],
 "voorspelling": {"dag": "3", "bewering": "dan", "bewijs": ["ENG-902"]},
 "geschillen": [{"onderwerp": "O", "standpunten": {"engineer": "a", "historian": "b", "koning": "c"}, "uitkomst": "historian", "bewijs": ["HIS-903"]},
                {"onderwerp": "P", "standpunten": {"oracle": "a"}, "uitkomst": "zo", "bewijs": []}]})
council.koning_chat = lambda s, g: "Hier is het:\n" + antwoord
v, g = council.stel_verdict_op(debat, leden, "run-1")
check("verzonnen ID weg", v["oorzaak"]["ingreep"]["bewijs"] == ["ENG-901"])
check("zekerheid geklemd", v["oorzaak"]["ingreep"]["zekerheid"] == 1.0)
check("bewering zonder debat-bewijs -> null", v["oorzaak"]["mechanisme"] == {"bewering": None, "bewijs": []})
check("lege actie weg", len(v["acties"]) == 1)
check("voorspelling dag als int", v["voorspelling"]["dag"] == 3)
check("verdict schema", council.schema_fouten("verdict.json", v) == [])
check("koning geen standpunt", "koning" not in g[0]["standpunten"])
check("onbeslecht zonder bewijs", g[1]["uitkomst"] is None and g[1]["toelichting"] == "zo")

# kapot antwoord -> veilige fallback
council.koning_chat = lambda s, g: "sorry"
v2, g2 = council.stel_verdict_op(debat, leden, "run-1")
check("fallback-verdict geldig", council.schema_fouten("verdict.json", v2) == [])

# volledige trace volgens schema + spelregels
trace = {"run_id": "run-1", "status": "klaar", "raadsleden": [l.ROL for l in leden], "geschillen": g, "beurten": [
 {"nr": 1, "ronde": 1, "spreker": "koning", "soort": "routering", "aan": "engineer", "vraag": "v", "reden": "r", "open_vragen": ["q"]},
 {"nr": 2, "ronde": 1, "spreker": "engineer", "soort": "toolcall", "tool": "zoek", "argumenten": {"term": "x"}, "pad": "https://h/engineer/mcp"},
 {"nr": 3, "ronde": 1, "spreker": "engineer", "soort": "bericht", "tekst": "t"},
 {"nr": 4, "ronde": 1, "spreker": "koning", "soort": "routering", "aan": None, "vraag": None, "reden": "genoeg", "open_vragen": []},
 {"nr": 5, "ronde": 2, "spreker": "koning", "soort": "bericht", "tekst": "s"}]}
check("trace schema", council.schema_fouten("trace.json", trace) == [])
check("spelregels", validate.spelregels(trace) == [])
print("\nALLES GROEN" if not fouten else f"\n{fouten} FOUT(EN)")
sys.exit(1 if fouten else 0)
