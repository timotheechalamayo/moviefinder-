(() => {
  const PEOPLE = ["Tim", "Pauli"];
  const PER_SESSION = 15;
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const movies = JSON.parse($("movie-data").textContent);
  const byId = new Map(movies.map((m) => [m.i, m]));
  const indexOf = new Map(movies.map((m, i) => [m.i, i]));
  const GENRES = [...new Set(movies.flatMap((m) => m.g))].sort((a, b) => a.localeCompare(b, "de"));

  let me = ls.get("ff.me", null);
  let prefs = Object.assign({ minRating: 7, genres: [] }, ls.get("ff.prefs", {}));
  // sessions[id] = { id, created, min, genres, films: [tt], mine: {tt: 1|0}, partner: {tt: 1|0} | null }
  let sessions = ls.get("ff.sessions", {});
  let current = null;            // aktive Session-ID
  let view = "start";
  const undoStack = [];

  const other = () => PEOPLE.find((p) => p !== me) || "Pauli";
  const fmt = (n) => n.toFixed(1).replace(".", ",");
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3400); }
  function save() { ls.set("ff.sessions", sessions); ls.set("ff.prefs", prefs); }
  const S = () => sessions[current];

  // ---------- Plakate ----------
  const IMG = "https://upload.wikimedia.org/wikipedia/";
  let wikiCache = ls.get("ff.wikiimg", {});
  const imgSrc = (m) => (m.b ? IMG + m.b : wikiCache[m.i] || "");
  // Für Filme ohne Plakat in der Liste: einmal bei Wikipedia nachschlagen
  async function lookupPoster(m) {
    if (m.b || m.i in wikiCache) return;
    wikiCache[m.i] = "";
    try {
      const titles = [`${m.t} (${m.y} film)`, `${m.t} (film)`].join("|");
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&titles=" + encodeURIComponent(titles);
      const pages = Object.values((await (await fetch(url)).json()).query?.pages || {});
      const hit = pages.find((p) => p.thumbnail);
      if (hit) {
        wikiCache[m.i] = hit.thumbnail.source;
        document.querySelectorAll(`[data-id="${m.i}"] img`).forEach((img) => { img.src = hit.thumbnail.source; img.hidden = false; });
      }
    } catch {}
    ls.set("ff.wikiimg", wikiCache);
  }
  const imgTag = (m, cls) => `<img class="${cls}" src="${esc(imgSrc(m))}" alt="" draggable="false" ${imgSrc(m) ? "" : "hidden"} onerror="this.hidden=true">`;
  const poster = (m) => { const h = hash(m.i) % 360; return `linear-gradient(160deg, hsl(${h} 45% 34%), hsl(${(h + 40) % 360} 55% 16%) 70%)`; };

  // ---------- Sessions ----------
  const inPool = (m, min, genres) => m.r >= min && (!genres.length || m.g.some((g) => genres.includes(g)));
  const poolSize = () => movies.filter((m) => inPool(m, prefs.minRating, prefs.genres)).length;
  function newId() { return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5); }
  function createSession() {
    const id = newId();
    const seen = new Set(Object.values(sessions).flatMap((s) => s.films));
    let pool = movies.filter((m) => inPool(m, prefs.minRating, prefs.genres));
    const fresh = pool.filter((m) => !seen.has(m.i));
    if (fresh.length >= PER_SESSION) pool = fresh;
    // Zufällig, bekanntere Filme etwas wahrscheinlicher
    const key = (m) => Math.pow(hash(m.i + ":" + id) / 4294967296, 1 / Math.log10(m.v + 10));
    const films = pool.sort((a, b) => key(b) - key(a)).slice(0, PER_SESSION).map((m) => m.i);
    sessions[id] = { id, created: Date.now(), min: prefs.minRating, genres: [...prefs.genres], films, mine: {}, partner: null };
    save();
    openSession(id);
  }
  const remaining = (s) => s.films.filter((tt) => s.mine[tt] === undefined);
  const matchesOf = (s) => (s.partner ? s.films.filter((tt) => s.mine[tt] === 1 && s.partner[tt] === 1) : []);
  const partnerDone = (s) => s.partner && s.films.every((tt) => s.partner[tt] !== undefined);
  function describe(s) {
    return `IMDb ab ${fmt(s.min)} · ${s.genres.length ? s.genres.join(", ") : "alle Genres"}`;
  }
  function when(ts) { return new Date(ts).toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); }

  // ---------- Link-Austausch ----------
  // #s=2.<id>.<von>.<min*10>.<genre-bits>.<film-indizes>.<stimmen>
  function makeLink() {
    const s = S();
    let gbits = 0n;
    s.genres.forEach((g) => { const i = GENRES.indexOf(g); if (i >= 0) gbits |= 1n << BigInt(i); });
    const films = s.films.map((tt) => indexOf.get(tt).toString(36)).join("-");
    const votes = s.films.map((tt) => (s.mine[tt] === 1 ? "1" : s.mine[tt] === 0 ? "0" : "x")).join("");
    const code = ["2", s.id, me, Math.round(s.min * 10), gbits.toString(36), films, votes].join(".");
    return location.href.split("#")[0] + "#s=" + code;
  }
  let pendingNote = null;
  function readLink() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return;
    $("share-overlay").hidden = true;
    history.replaceState(null, "", location.href.split("#")[0]);
    const [ver, id, from, min, gb, filmStr, votes] = decodeURIComponent(m[1]).split(".");
    if (ver !== "2" || !id || !PEOPLE.includes(from) || !filmStr) { toast("Der Link ist unvollständig. Lass ihn dir nochmal schicken."); return; }
    if (from === me) { toast("Das ist dein eigener Link. Schick ihn an " + other() + "."); return; }
    if (!me) { me = PEOPLE.find((p) => p !== from); ls.set("ff.me", me); }
    const films = filmStr.split("-").map((x) => movies[parseInt(x, 36)]).filter(Boolean).map((mv) => mv.i);
    let gbits = 0n; try { gbits = BigInt(parseInt(gb || "0", 36)); } catch {}
    const genres = GENRES.filter((_, i) => (gbits >> BigInt(i)) & 1n);
    const partner = {};
    films.forEach((tt, i) => { if (votes?.[i] === "1") partner[tt] = 1; else if (votes?.[i] === "0") partner[tt] = 0; });
    const isNew = !sessions[id];
    if (isNew) sessions[id] = { id, created: Date.now(), min: (+min || 70) / 10, genres, films, mine: {}, partner };
    const s = sessions[id];
    const before = new Set(matchesOf(s));
    s.partner = partner;
    save();
    current = id;
    const fresh = matchesOf(s).filter((tt) => !before.has(tt));
    const done = Object.keys(partner).length;
    if (isNew) pendingNote = { text: `${from} hat dich zu einer Session eingeladen (${describe(s)}). ${done ? from + " hat schon " + done + " von " + films.length + " Filmen geswipt." : ""}` };
    else if (fresh.length) pendingNote = { fresh };
    else pendingNote = { text: `${from}s Swipes übernommen.` };
    view = remaining(s).length ? "swipe" : "result";
  }

  async function share() {
    if (!me || !S()) return;
    const s = S();
    const url = makeLink();
    const left = remaining(s).length;
    const text = left === s.films.length
      ? `Filmfinder-Session: ${describe(s)}. Swipe die ${s.films.length} Filme, dann sehen wir unsere Matches:`
      : `Meine Swipes für unsere Filmfinder-Session (${describe(s)}):`;
    if (navigator.share) {
      try { await navigator.share({ title: "Filmfinder", text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    $("share-text").value = url;
    $("share-overlay").hidden = false;
    $("share-text").select();
  }
  $("share-copy").onclick = async () => {
    const t = $("share-text");
    try { await navigator.clipboard.writeText(t.value); toast("Link kopiert."); }
    catch { t.focus(); t.select(); toast("Link markiert. Jetzt kopieren."); }
  };
  $("share-close").onclick = () => ($("share-overlay").hidden = true);
  $("btn-send").onclick = share;
  $("btn-invite").onclick = share;

  // ---------- Render ----------
  function show(v) {
    view = v;
    ["start", "swipe", "result"].forEach((n) => ($("view-" + n).hidden = n !== v));
    window.scrollTo(0, 0);
    render();
  }
  function render() {
    PEOPLE.forEach((p) => $("who-" + p).setAttribute("aria-pressed", String(p === me)));
    $("pick-overlay").hidden = !!me;
    document.querySelectorAll(".o-name").forEach((el) => (el.textContent = other()));
    if (view === "start") renderStart();
    if (view === "swipe") renderSwipe();
    if (view === "result") renderResult();
  }
  function renderStart() {
    $("min-rating").value = prefs.minRating;
    $("min-out").textContent = fmt(+prefs.minRating);
    $("genre-chips").innerHTML = GENRES.map((g) => `<button type="button" aria-pressed="${prefs.genres.includes(g)}" data-g="${esc(g)}">${esc(g)}</button>`).join("");
    $("genre-hint").textContent = prefs.genres.length ? prefs.genres.length + " gewählt" : "alle";
    const n = poolSize();
    $("pool").textContent = n >= PER_SESSION ? `${n.toLocaleString("de-DE")} Filme passen, davon kommen ${PER_SESSION} zufällig.` : n ? `Nur ${n} Filme passen. Senk die IMDb-Grenze oder wähl mehr Genres.` : "Kein Film passt. Senk die IMDb-Grenze oder wähl andere Genres.";
    $("btn-start").disabled = !n;
    $("btn-start").textContent = `${Math.min(n, PER_SESSION) || PER_SESSION} Filme ziehen`;
    const list = Object.values(sessions).sort((a, b) => b.created - a.created).slice(0, 12);
    $("past").innerHTML = list.length ? `<h2>Eure Sessions</h2>` + list.map((s) => {
      const left = remaining(s).length, mt = matchesOf(s).length;
      const state = left ? `noch ${left} zu swipen` : !s.partner ? `warte auf ${other()}` : !partnerDone(s) ? `${other()} swipt noch` : "fertig";
      return `<button class="sess" data-s="${s.id}"><b>${when(s.created)}</b><span class="pill ${mt ? "hot" : ""}">${mt} ${mt === 1 ? "Match" : "Matches"}</span><span class="sub">${esc(describe(s))} · ${state}</span></button>`;
    }).join("") : "";
  }
  function cardHTML(m) {
    const meta = [m.d && `Regie ${esc(m.d)}`, m.c.length && esc(m.c.join(", ")), m.m && `${m.m} Min.`].filter(Boolean).join(" · ");
    return `${imgTag(m, "poster")}<div class="shade"></div><div class="grain"></div>
      <div class="rating">★ ${fmt(m.r)} <small>${(m.v / 1000).toFixed(0)}k Stimmen</small></div>
      <div class="year">${m.y}</div>
      <div class="stamp yes">Ja</div><div class="stamp no">Nö</div>
      <h2>${esc(m.t)}</h2>
      <div class="chips">${m.g.map((g) => `<span>${esc(g)}</span>`).join("")}</div>
      <div class="meta">${meta}</div>
      <div class="plot">${m.p ? esc(m.p) : "<em>Keine Beschreibung vorhanden.</em>"}</div>
      <a class="imdb" href="https://www.imdb.com/title/${m.i}/" target="_blank" rel="noopener">Auf IMDb ansehen ↗</a>`;
  }
  function renderSwipe() {
    const s = S();
    const left = remaining(s);
    const done = s.films.length - left.length;
    $("prog-text").textContent = `${Math.min(done + 1, s.films.length)} / ${s.films.length}`;
    $("prog-bar").style.width = (done / s.films.length) * 100 + "%";
    $("ssum").textContent = describe(s);
    $("btn-undo").disabled = undoStack.length === 0;
    const stage = $("stage");
    stage.innerHTML = "";
    left.slice(0, 2).reverse().forEach((tt, i, arr) => {
      const m = byId.get(tt);
      const el = document.createElement("article");
      el.className = "card" + (i < arr.length - 1 ? " back" : "");
      el.style.setProperty("--poster", poster(m));
      el.innerHTML = cardHTML(m);
      el.dataset.id = m.i;
      stage.appendChild(el);
      if (i === arr.length - 1) attachDrag(el);
      lookupPoster(m);
    });
  }
  function renderResult() {
    const s = S();
    const o = other();
    const mt = matchesOf(s);
    const left = remaining(s).length;
    $("btn-continue").hidden = !left;
    if (left) {
      $("res-title").textContent = "Session offen";
      $("res-text").textContent = `Du hast noch ${left} von ${s.films.length} Filmen vor dir.`;
    } else if (!s.partner) {
      $("res-title").textContent = "Deine 15 sind durch";
      $("res-text").textContent = `Schick ${o} die Session. Sobald ${o} geswipt und dir den Link zurückgeschickt hat, siehst du hier eure Matches.`;
    } else if (!partnerDone(s)) {
      $("res-title").textContent = mt.length ? `${mt.length} ${mt.length === 1 ? "Match" : "Matches"} bisher` : "Fast geschafft";
      $("res-text").textContent = `${o} hat erst ${Object.keys(s.partner).length} von ${s.films.length} Filmen geswipt. Schick deine Swipes, damit ${o} am Ende eure Matches sieht.`;
    } else {
      $("res-title").textContent = mt.length ? (mt.length === 1 ? "Ein Match!" : `${mt.length} Matches!`) : "Kein Match";
      $("res-text").textContent = mt.length
        ? `Diese Filme wollt ihr beide sehen. Schick ${o} noch deine Swipes, falls ${o} das Ergebnis noch nicht hat.`
        : `Diesmal war nichts dabei, was ihr beide sehen wollt. Startet einfach eine neue Session.`;
    }
    $("match-list").innerHTML = mt.map((tt) => {
      const m = byId.get(tt);
      return `<div class="match" data-id="${m.i}">
        <div class="mini" style="--poster:${poster(m)}">${esc(m.t.split(" ").slice(0, 3).join(" "))}${imgTag(m, "mini-img")}</div>
        <div><b>${esc(m.t)}</b>
          <div class="sub"><span class="r">★ ${fmt(m.r)}</span> · ${m.y}${m.m ? " · " + m.m + " Min." : ""} · ${esc(m.g.slice(0, 3).join(", "))}</div>
          <a href="https://www.imdb.com/title/${m.i}/" target="_blank" rel="noopener">Auf IMDb ↗</a></div>
      </div>`;
    }).join("");
  }

  // ---------- Swipen ----------
  function swipe(like) {
    const s = S();
    const tt = remaining(s)[0];
    if (!tt || !me) return;
    const m = byId.get(tt);
    const card = $("stage").querySelector(`.card[data-id="${tt}"]`);
    s.mine[tt] = like ? 1 : 0;
    undoStack.push(tt);
    save();
    const isMatch = like && s.partner?.[tt] === 1;
    const finish = () => {
      if (isMatch) showMatch(m);
      if (!remaining(s).length) show("result"); else renderSwipe();
    };
    if (card) {
      card.style.transform = `translateX(${like ? 140 : -140}%) rotate(${like ? 22 : -22}deg)`;
      card.style.opacity = "0";
      setTimeout(finish, 260);
    } else finish();
  }
  function undo() {
    const tt = undoStack.pop();
    if (!tt || !S()) return;
    const s = S();
    delete s.mine[tt];
    // die zurückgenommene Karte wieder nach vorn
    s.films = [tt, ...s.films.filter((x) => x !== tt)];
    save();
    if (view !== "swipe") show("swipe"); else renderSwipe();
  }
  function attachDrag(el) {
    let x0 = 0, y0 = 0, dx = 0, active = false;
    const yes = el.querySelector(".stamp.yes"), no = el.querySelector(".stamp.no");
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, .plot")) return;
      active = true; x0 = e.clientX; y0 = e.clientY; dx = 0; el.classList.add("dragging"); el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!active) return;
      dx = e.clientX - x0; const dy = (e.clientY - y0) * 0.3;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const end = () => {
      if (!active) return; active = false; el.classList.remove("dragging");
      if (Math.abs(dx) > 100) swipe(dx > 0);
      else { el.style.transform = ""; yes.style.opacity = no.style.opacity = 0; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  function showMatch(m, head = "Match!", lead = "Ihr wollt beide sehen:") {
    $("match-head").textContent = head;
    $("match-lead").textContent = lead;
    $("match-title").textContent = m ? m.t : "";
    $("match-sub").textContent = m ? `★ ${fmt(m.r)} · ${m.y}${m.d ? " · " + m.d : ""}` : "";
    $("match-overlay").hidden = false;
  }

  // ---------- Bedienung ----------
  function setMe(p) { me = p; ls.set("ff.me", p); render(); }
  PEOPLE.forEach((p) => { $("who-" + p).onclick = () => setMe(p); $("pick-" + p).onclick = () => setMe(p); });
  function openSession(id) { current = id; undoStack.length = 0; show(remaining(S()).length ? "swipe" : "result"); }
  $("past").onclick = (e) => { const b = e.target.closest("[data-s]"); if (b) { current = b.dataset.s; undoStack.length = 0; show("result"); } };
  $("genre-chips").onclick = (e) => {
    const b = e.target.closest("[data-g]"); if (!b) return;
    const g = b.dataset.g;
    prefs.genres = prefs.genres.includes(g) ? prefs.genres.filter((x) => x !== g) : [...prefs.genres, g];
    save(); renderStart();
  };
  $("min-rating").oninput = (e) => { prefs.minRating = +e.target.value; save(); $("min-out").textContent = fmt(prefs.minRating); const n = poolSize(); $("pool").textContent = n >= PER_SESSION ? `${n.toLocaleString("de-DE")} Filme passen, davon kommen ${PER_SESSION} zufällig.` : n ? `Nur ${n} Filme passen. Senk die IMDb-Grenze oder wähl mehr Genres.` : "Kein Film passt. Senk die IMDb-Grenze oder wähl andere Genres."; $("btn-start").disabled = !n; };
  $("min-rating").onchange = () => renderStart();
  $("btn-start").onclick = createSession;
  $("btn-new").onclick = () => show("start");
  $("btn-back").onclick = () => show("start");
  $("btn-back2").onclick = () => show("start");
  $("btn-continue").onclick = () => show("swipe");
  $("btn-yes").onclick = () => swipe(true);
  $("btn-no").onclick = () => swipe(false);
  $("btn-undo").onclick = undo;
  $("match-close").onclick = () => ($("match-overlay").hidden = true);
  document.addEventListener("keydown", (e) => {
    if (view !== "swipe" || e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") swipe(true);
    else if (e.key === "ArrowLeft") swipe(false);
    else if (e.key === "Backspace") undo();
  });
  window.addEventListener("hashchange", () => { readLink(); boot(); });

  function boot() {
    if (current && S()) show(view); else show("start");
    const note = pendingNote; pendingNote = null;
    if (!note) return;
    if (note.fresh) {
      const f = note.fresh.map((tt) => byId.get(tt));
      if (f.length === 1) showMatch(f[0]);
      else showMatch(null, `${f.length} Matches!`, `${other()}s Swipes sind da. Ihr habt ${f.length} neue gemeinsame Filme.`);
    } else if (note.text) toast(note.text);
  }

  readLink();
  boot();
})();
