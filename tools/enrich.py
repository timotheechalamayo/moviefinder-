"""Holt Plakate und deutsche Kurzbeschreibungen für alle Filme in src/movies.json.

Läuft als GitHub Action (dort ist das Internet frei erreichbar) und schreibt src/enrich.json:
  { "tt0111161": { "img": "<url>", "src": "enwiki|dewiki|imdb", "de": "<deutscher Text>" }, ... }
Quellen: Wikidata (IMDb-ID -> Wikipedia-Artikel), Wikipedia-Seitenbilder und deutsche
Artikel-Einleitungen; fehlt danach noch ein Bild, das Plakat von der IMDb-Titelseite.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "FilmfinderEnrich/1.0 (https://github.com/timotheechalamayo/moviefinder-)"
movies = json.load(open(os.path.join(ROOT, "src", "movies.json"), encoding="utf-8"))
out_path = os.path.join(ROOT, "src", "enrich.json")
out = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {}

def get(url, data=None, accept="application/json", tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": accept,
                                                                   "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("  retry", i + 1, url[:90], e, flush=True)
            time.sleep(3 * (i + 1))
    return None

ids = [m["i"] for m in movies]

# 1) Wikidata: IMDb-ID -> en/de Wikipedia-Titel
links = {}
for k in range(0, len(ids), 150):
    batch = ids[k:k + 150]
    q = """SELECT ?imdb ?en ?de WHERE { VALUES ?imdb { %s } ?item wdt:P345 ?imdb .
      OPTIONAL { ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en }
      OPTIONAL { ?b schema:about ?item; schema:isPartOf <https://de.wikipedia.org/>; schema:name ?de } }""" % " ".join('"%s"' % i for i in batch)
    body = get("https://query.wikidata.org/sparql", data=urllib.parse.urlencode({"query": q, "format": "json"}).encode(),
               accept="application/sparql-results+json")
    if not body: continue
    for row in json.loads(body)["results"]["bindings"]:
        d = links.setdefault(row["imdb"]["value"], {})
        if "en" in row: d.setdefault("en", row["en"]["value"])
        if "de" in row: d.setdefault("de", row["de"]["value"])
    print("wikidata", k + len(batch), "/", len(ids), flush=True)
    time.sleep(1)

def wiki(lang, titles, extracts):
    """Seitenbild (und optional Einleitung) für bis zu 20 Titel."""
    p = {"action": "query", "format": "json", "redirects": 1, "prop": "pageimages" + ("|extracts" if extracts else ""),
         "piprop": "thumbnail", "pithumbsize": 600, "pilimit": 50, "titles": "|".join(titles)}
    if extracts: p.update({"exintro": 1, "explaintext": 1, "exlimit": 20, "exsentences": 3})
    body = get(f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(p))
    if not body: return {}
    j = json.loads(body).get("query", {})
    norm = {n["to"]: n["from"] for n in j.get("normalized", [])}
    redir = {r["to"]: r["from"] for r in j.get("redirects", [])}
    res = {}
    for pg in j.get("pages", {}).values():
        t = pg.get("title", "")
        orig = norm.get(redir.get(t, t), redir.get(t, t))
        res[orig] = {"img": pg.get("thumbnail", {}).get("source"), "text": pg.get("extract")}
    return res

def run(lang, key, extracts):
    pairs = [(tt, d[key]) for tt, d in links.items() if key in d]
    for k in range(0, len(pairs), 20):
        chunk = pairs[k:k + 20]
        res = wiki(lang, [t for _, t in chunk], extracts)
        for tt, t in chunk:
            r = res.get(t) or {}
            e = out.setdefault(tt, {})
            if r.get("img") and "img" not in e: e["img"], e["src"] = r["img"], lang + "wiki"
            if extracts and r.get("text") and "de" not in e: e["de"] = r["text"].strip()
        if k % 400 == 0: print(lang, k, "/", len(pairs), flush=True)
        time.sleep(0.3)

run("en", "en", False)   # englische Artikel haben meist das Kinoplakat
run("de", "de", True)    # deutsche Einleitung als Kurzbeschreibung, Bild falls noch keins

# 3) Fehlt noch ein Bild: Plakat von der IMDb-Titelseite (og:image)
missing = [tt for tt in ids if "img" not in out.get(tt, {})]
print("imdb fallback for", len(missing), flush=True)
for n, tt in enumerate(missing):
    html = get(f"https://www.imdb.com/title/{tt}/", accept="text/html", tries=2)
    m = html and re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if m and "imdb_logo" not in m.group(1):
        out.setdefault(tt, {}).update(img=m.group(1), src="imdb")
    if n % 50 == 0: print("imdb", n, "/", len(missing), flush=True)
    time.sleep(0.8)

json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
print("done:", sum(1 for tt in ids if out.get(tt, {}).get("img")), "images,",
      sum(1 for tt in ids if out.get(tt, {}).get("de")), "german texts of", len(ids))
