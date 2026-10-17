# Baut index.html aus den Teilen in src/: python3 src/build.py
import os
D = os.path.dirname(os.path.abspath(__file__))
r = lambda f: open(os.path.join(D, f), encoding='utf-8').read()
css = r('style.css').replace('</style>', '') + r('extra.css') + '</style>'
data = r('movies.json').replace('</', '<\\/')
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
