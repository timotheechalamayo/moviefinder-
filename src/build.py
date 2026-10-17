# Baut index.html aus den Teilen in src/: python3 src/build.py
import os
D = os.path.dirname(os.path.abspath(__file__))
r = lambda f: open(os.path.join(D, f), encoding='utf-8').read()
css = r('style.css').replace('</style>', '') + r('extra.css') + '</style>'
import json, re

def short_de(t, limit=330):
    """Deutsche Einleitung auf zwei, drei Sätze kürzen."""
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= limit: return t
    cut = [m.end() for m in re.finditer(r"[.!?](?=\s+[A-ZÄÖÜ])", t) if m.end() <= limit]
    return t[:cut[-1]] if cut and cut[-1] > 80 else t[:limit].rsplit(" ", 1)[0] + "…"

movies = json.loads(r('movies.json'))
enrich = json.loads(r('enrich.json')) if os.path.exists(os.path.join(D, 'enrich.json')) else {}
manual = json.loads(r('de_manual.json')) if os.path.exists(os.path.join(D, 'de_manual.json')) else {}
WM = "https://upload.wikimedia.org/wikipedia/"
for m in movies:
    e = enrich.get(m['i'], {})
    # Plakat: engl. Wikipedia, sonst bisheriges Wikipedia-Plakat, sonst IMDb, sonst Bild aus dt. Artikel
    img = e.get('en') or (WM + m['b'] if m.get('b') else None) or e.get('imdb') or e.get('dew')
    if img: m['b'] = img.split('?')[0]
    else: m.pop('b', None)
    de = e.get('de') if len(e.get('de') or '') >= 50 else None
    de = manual.get(m['i']) or de
    if de: m['p'] = short_de(de)
    elif m.get('p'): m['p'] = ''   # nur englischer Text vorhanden
data = json.dumps(movies, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#8c1c3b">
<title>Tim &amp; Paulis Filmfinder</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap">
{css}
<style>body{{margin:0}} :root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}</style>
</head>
<body>
{r('body.html')}
<script id="movie-data" type="application/json">{data}</script>
<script>
{r('app.js')}
</script>
</body>
</html>
'''
open(os.path.join(D, '..', 'index.html'), 'w', encoding='utf-8').write(html)
print(len(html.encode()))
