# Tim & Paulis Filmfinder

Tinder-artiger Filmfinder im Browser: https://timotheechalamayo.github.io/moviefinder-/

- Eine Session: IMDb-Mindestbewertung und Genres wählen, dann kommen 15 Filme zum Swipen.
- Die Session per Link an die andere Person schicken. Sie swipt dieselben 15 Filme, und alles, was ihr beide mögt, wird ein Match.
- Gespeichert wird nur im eigenen Browser, kein Server und kein Konto nötig.
- Daten: 4.083 Filme mit IMDb-Bewertung (bis 2016), Plakate von Wikipedia.

Bauen: Teile liegen in `src/`, `python3 src/build.py` schreibt `index.html`.
Die Reihenfolge in `src/movies.json` nicht ändern, sonst funktionieren alte Links nicht mehr.
