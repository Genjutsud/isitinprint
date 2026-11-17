// IsItInPrint: static front end. Reads data/sets.json; no server needed.
// Set this to your repository so the footer links to it.
const REPO_URL = "https://github.com/Genjutsud/isitinprint";
// Image hosts the site links to (keep in step with scripts/sources/index.mjs).
const IMAGE_HOSTS = ["https://upload.wikimedia.org/", "https://images.pokemontcg.io/", "https://svgs.scryfall.io/"];

(function(){
  const S = { sets: [], loaded: false, noDb: false, q: "", games: new Set(), statuses: new Set(),
    picked: null, active: -1, open: false, showAll: { current: false } };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmt(m, long){
    if(!m) return ""; const p = String(m).split("-");
    if (p.length === 1) return p[0];
    const mo = MONTHS[+p[1]-1] || "";
    return (long && p[2]) ? `${mo} ${+p[2]}, ${p[0]}` : `${mo} ${p[0]}`;
  }
  const strip = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"");
  const norm = s => strip(s).toLowerCase().replace(/[’'`]/g,"").replace(/[^a-z0-9.]+/g," ").trim();
  const compact = s => norm(s).replace(/[\s.]/g,"");
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  const ST = {
    in_print:     { cls:"yes",   short:"YES",  label:"In print",         verdict: s => "Yes, it's still in print." },
    out_of_print: { cls:"no",    short:"NO",   label:"Out of print",     verdict: s => s.lastPrint ? `No. Last known print: ${fmt(s.lastPrint)}.` : "No, it's out of print." },
    unknown:      { cls:"maybe", short:"—",    label:"No official word", verdict: s => "No official word from the publisher yet." },
    upcoming:     { cls:"soon",  short:"SOON", label:"Not released yet", verdict: s => s.release ? `Not out yet. Releases ${fmt(s.release, true)}.` : "Not out yet." }
  };
  const st = s => ST[s.status] || ST.unknown;
  const BASIS = { official:"Official", current:"Current release", historical:"Historical record", announced:"Announced", none:"No official word" };
  const SHORT = { "Magic: The Gathering":"Magic", "One Piece Card Game":"One Piece", "Disney Lorcana":"Lorcana" };

  // phone layout for a row of n cells: 3 columns when n divides by 3, else 2 with the first cell spanning when n is odd
  function cellLayout(n){ const m = n % 3 === 0 ? 3 : 2; return { m, spanFirst: m === 2 && n % 2 === 1 }; }
  function cellsHTML(el, items){
    const { m, spanFirst } = cellLayout(items.length);
    el.style.setProperty("--n", items.length); el.style.setProperty("--m", m);
    el.innerHTML = items.map((h, i) => (i === 0 && spanFirst) ? h.replace('class="cell', 'class="cell span-sm') : h).join("");
  }

  // ---------- search ranking ----------
  function score(s, q){
    const qn = norm(q), qc = compact(q);
    if (!qn) return 0;
    const name = norm(s.name), code = compact(s.code||""), aliases = (s.aliases||[]).map(norm), game = norm(s.game);
    let best = 0;
    if (code && code === qc) best = 120;
    else if (code && qc.length >= 2 && code.startsWith(qc)) best = 100;
    for (const h of [name, ...aliases]){
      if (h === qn) best = Math.max(best, 110);
      else if (h.startsWith(qn)) best = Math.max(best, 90);
      else if ((" " + h).includes(" " + qn)) best = Math.max(best, 70);
      else if (h.includes(qn)) best = Math.max(best, 50);
    }
    if (!best){
      const all = name + " " + aliases.join(" ") + " " + game + " " + norm(s.code||"");
      if (qn.split(" ").every(w => all.includes(w))) best = 35;
    }
    if (best && S.games.has(s.game)) best += 5;
    return best;
  }
  function matches(q){
    return S.sets.map(s => [s, score(s, q)]).filter(x => x[1] > 0)
      .sort((a,b) => b[1]-a[1] || String(b[0].release||"").localeCompare(String(a[0].release||""))).map(x => x[0]);
  }
  function highlight(text, q){
    const t = String(text||""), needle = strip(q.trim()).toLowerCase();
    if (!needle) return esc(t);
    const i = strip(t).toLowerCase().indexOf(needle);
    if (i < 0) return esc(t);
    return esc(t.slice(0,i)) + "<mark>" + esc(t.slice(i,i+needle.length)) + "</mark>" + esc(t.slice(i+needle.length));
  }

  // ---------- suggestions ----------
  let sugg = [];
  function renderSuggest(){
    const box = $("suggest"), q = S.q.trim();
    if (!S.open || !q){ box.hidden = true; $("q").setAttribute("aria-expanded","false"); $("q").removeAttribute("aria-activedescendant"); return; }
    sugg = matches(q).slice(0, 8);
    box.innerHTML = !sugg.length
      ? `<li class="none">${S.loaded ? `No set matches “${esc(q)}”.` : "Sets are still loading…"}</li>`
      : sugg.map((s,i) => { const x = st(s);
          return `<li class="opt" role="option" id="opt-${i}" data-i="${i}" aria-selected="${i===S.active}">
            <span class="dot ${x.cls}" aria-hidden="true"></span>
            <span style="min-width:0"><span class="nm">${highlight(s.name, q)}</span><br><span class="gm">${esc(s.game)}${s.code ? " · " + highlight(s.code, q) : ""}${s.release ? " · " + esc(fmt(s.release)) : ""}</span></span>
            <span class="pill ${x.cls}">${x.label}</span></li>`; }).join("");
    box.hidden = false; $("q").setAttribute("aria-expanded","true");
    if (S.active >= 0 && sugg.length) { $("q").setAttribute("aria-activedescendant","opt-"+S.active); const el = $("opt-"+S.active); el && el.scrollIntoView({block:"nearest"}); }
    else $("q").removeAttribute("aria-activedescendant");
  }
  function pick(s){
    if (!s) return;
    S.picked = s.id; S.open = false; S.active = -1; S.q = s.name; $("q").value = s.name;
    try { history.replaceState(null, "", "#" + s.id); } catch(_){}
    renderSuggest(); renderAnswer(); render();
    $("answer").scrollIntoView({ block:"nearest", behavior: reduce() });
  }
  function clearPick(){ S.picked = null; try{ history.replaceState(null,"",location.pathname) }catch(_){} renderAnswer(); }

  // ---------- set art ----------
  function artHTML(s){
    // Images are linked straight from their source, never copied. Only these hosts are shown.
    const url = String(s.imageUrl || "");
    const host = IMAGE_HOSTS.find(h => url.startsWith(h));
    if (host) {
      const wiki = host.includes("wikimedia");
      const credit = /^https:\/\//.test(s.imageCredit || "")
        ? `<a class="credit" href="${esc(s.imageCredit)}" target="_blank" rel="noopener" title="${wiki ? "Image from Wikipedia" : "Image source"}">${wiki ? "W" : "src"}</a>` : "";
      const icon = host.includes("scryfall") ? " icon" : ""; // Scryfall symbols are black line art
      return `<div class="art${icon}"><img src="${esc(url)}" alt="${esc(s.name)} set image" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('ph');this.remove()">${credit}</div>`;
    }
    return `<div class="art ph" aria-hidden="true"><span>${esc(s.code || "Image")}</span></div>`;
  }

  // ---------- answer ----------
  function renderAnswer(){
    const s = S.sets.find(x => x.id === S.picked);
    if (!s){ $("answer").innerHTML = ""; return; }
    const x = st(s);
    const link = (u, n) => /^https?:\/\//.test(u||"") ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n || u)}</a>` : "";
    const facts = [
      ["Game", esc(s.game)],
      s.code ? ["Set code", esc(s.code)] : null,
      s.release ? ["Released", esc(fmt(s.release, true))] : null,
      s.status !== "upcoming" ? ["Last known print", s.lastPrint ? esc(fmt(s.lastPrint)) + (s.lastPrintNote ? `<span class="sub">${esc(s.lastPrintNote)}</span>` : "") : "Not documented"] : null,
      ["Based on", s.basis ? `<span class="basis ${esc(s.basis)}">${BASIS[s.basis] || esc(s.basis)}</span>` : "—"]
    ].filter(Boolean);
    const src = (s.source ? `Status source: ${link(s.source, s.sourceName)}` : "Status source: none yet. The publisher hasn't posted about this set.") +
      (s.ref && s.ref !== s.source ? `<br>Set details: ${link(s.ref, s.refName)}` : "") + (s.checked ? `<br>Checked ${esc(fmt(s.checked))}` : "");
    $("answer").innerHTML = `<article class="answer" aria-live="polite">
      <i class="tick tl"></i><i class="tick tr"></i><i class="tick bl"></i><i class="tick br"></i>
      <div class="head">
        <div class="bigstamp ${x.cls}" role="img" aria-label="${x.label}">${x.short}</div>
        <div class="body"><div class="setname">${esc(s.name)}</div><div class="verdict">${esc(x.verdict(s))}</div></div>
        ${artHTML(s)}
      </div>
      <div class="facts">${facts.map(([l,v]) => `<div class="fact"><span class="lbl">${l}</span><span class="val">${v}</span></div>`).join("")}</div>
      <div id="cardsBox"></div>
      <div class="foot">${s.notes ? `<div class="why">${esc(s.notes)}</div>` : ""}<div class="src">${src}</div><div class="bar"><button class="close" type="button" id="closeAnswer">Close</button></div></div>
    </article>`;
    loadCards(s);
  }

  // ---------- card lists ----------
  // Each set's cards live in data/cards/<set id>.json, refreshed weekly by a workflow.
  // Prices are raw market estimates; the links send people to check raw and graded values.
  const CARD_IMAGE_HOSTS = ["https://images.pokemontcg.io/", "https://cards.scryfall.io/"];
  const CARD_LIMIT = 30;
  const cardCache = {};
  const C = { setId: null, q: "", sort: "number", all: false };
  const money = v => typeof v === "number" ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  function valuationLinks(game, setName, c){
    const short = { "Pokémon":"Pokemon", "Magic: The Gathering":"MTG", "Disney Lorcana":"Lorcana", "One Piece Card Game":"One Piece", "Yu-Gi-Oh!":"Yugioh" }[game] || game;
    const q = [short, c.name, c.n, setName].filter(Boolean).join(" "), enc = encodeURIComponent;
    return {
      tcgplayer: /^https:\/\//.test(c.tp || "") ? c.tp : `https://www.tcgplayer.com/search/all/product?q=${enc(c.name + " " + setName)}`,
      ebayRaw: `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&LH_Sold=1&LH_Complete=1`,
      ebayGraded: `https://www.ebay.com/sch/i.html?_nkw=${enc(q + " PSA 10")}&LH_Sold=1&LH_Complete=1`,
      pricecharting: `https://www.pricecharting.com/search-products?q=${enc(q)}&type=prices`,
    };
  }
  function bigImage(u){ return u.replace("/small/", "/normal/").replace(/(images\.pokemontcg\.io\/[^/]+\/[^/.]+)\.png$/, "$1_hires.png"); }
  async function loadCards(s){
    const box = $("cardsBox"); if (!box) return;
    if (C.setId !== s.id) { C.setId = s.id; C.q = ""; C.sort = "number"; C.all = false; }
    if (s.status === "upcoming") { box.innerHTML = ""; return; }
    if (!(s.id in cardCache)) {
      box.innerHTML = `<section class="cardlist"><p class="cl-note">Loading cards…</p></section>`;
      try { const r = await fetch(`data/cards/${encodeURIComponent(s.id)}.json`, { cache: "no-cache" }); cardCache[s.id] = r.ok ? await r.json() : null; }
      catch(_) { cardCache[s.id] = null; }
      if (S.picked !== s.id) return; // the reader moved on
    }
    renderCards(s);
  }
  function renderCards(s){
    const box = $("cardsBox"), data = cardCache[s.id];
    if (!box) return;
    if (!data || !Array.isArray(data.cards) || !data.cards.length) {
      box.innerHTML = `<section class="cardlist"><div class="cl-head"><h3>Cards in this set</h3></div><p class="cl-note">No card list yet. It's added on the next weekly card update, once the set appears in the card sources.</p></section>`;
      return;
    }
    const needle = norm(C.q);
    let list = data.cards.filter(c => !needle || norm(`${c.name} ${c.n} ${c.r || ""}`).includes(needle));
    if (C.sort === "price") list = [...list].sort((a,b) => (b.p || 0) - (a.p || 0));
    const shown = C.all ? list : list.slice(0, CARD_LIMIT);
    const priced = data.cards.filter(c => c.p), top = priced.reduce((m, c) => c.p > (m ? m.p : 0) ? c : m, null);
    const rows = shown.map(c => {
      const L = valuationLinks(s.game, s.name, c);
      const img = CARD_IMAGE_HOSTS.some(h => (c.img || "").startsWith(h))
        ? `<a class="cl-img" href="${esc(bigImage(c.img))}" target="_blank" rel="noopener" title="View card"><img src="${esc(c.img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
        : `<span class="cl-img ph" aria-hidden="true"></span>`;
      return `<li class="cl-row">
        ${img}
        <span class="cl-n">${esc(c.n || "—")}</span>
        <span class="cl-name">${esc(c.name)}${c.r ? `<span class="cl-r">${esc(c.r)}</span>` : ""}</span>
        <span class="cl-price">${c.p ? money(c.p) : `<span class="cl-r">No price</span>`}${c.pf ? `<span class="cl-r">Foil ${money(c.pf)}</span>` : ""}</span>
        <span class="cl-links"><span class="cl-grp"><span class="cl-lbl">Raw</span><a href="${esc(L.tcgplayer)}" target="_blank" rel="noopener">TCGplayer</a><a href="${esc(L.ebayRaw)}" target="_blank" rel="noopener">eBay sold</a></span>
          <span class="cl-grp"><span class="cl-lbl">Graded</span><a href="${esc(L.pricecharting)}" target="_blank" rel="noopener">PriceCharting</a><a href="${esc(L.ebayGraded)}" target="_blank" rel="noopener">PSA 10 sold</a></span></span>
      </li>`;
    }).join("");
    const focused = document.activeElement && document.activeElement.id === "cardQ";
    box.innerHTML = `<section class="cardlist">
      <div class="cl-head">
        <h3>Cards in this set <span class="count">${data.cards.length}</span></h3>
        <div class="cl-tools">
          <input id="cardQ" type="text" placeholder="Find a card" value="${esc(C.q)}" autocomplete="off" aria-label="Find a card in this set">
          <button class="cell" type="button" data-csort="number" aria-pressed="${C.sort === "number"}">By number</button>
          <button class="cell" type="button" data-csort="price" aria-pressed="${C.sort === "price"}">By price</button>
        </div>
      </div>
      ${top ? `<p class="cl-top">Most valuable raw card: <strong>${esc(top.name)}</strong> ${esc(top.n ? "#" + top.n : "")} at ${money(top.p)}</p>` : ""}
      <ul class="cl-rows">${rows || `<li class="empty">No card matches “${esc(C.q)}”.</li>`}</ul>
      ${list.length > CARD_LIMIT ? `<button class="btn cl-more" type="button" data-cmore="1">${C.all ? "Show fewer" : `Show all ${list.length} cards`}</button>` : ""}
      <p class="cl-note">Prices are raw (ungraded) estimates: ${esc(data.priceNote || "market price")}, updated ${esc(fmt(data.updated, true))}. Use the Graded links for PSA and other slabbed values. Prices change daily; check before you buy or sell.</p>
    </section>`;
    if (focused) { const i = $("cardQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  document.addEventListener("input", e => { if (e.target.id === "cardQ") { C.q = e.target.value; C.all = false; const s = S.sets.find(x => x.id === S.picked); if (s) renderCards(s); } });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-csort],[data-cmore]"); if (!b) return;
    if (b.dataset.csort) C.sort = b.dataset.csort; else C.all = !C.all;
    const s = S.sets.find(x => x.id === S.picked); if (s) renderCards(s);
  });

  // A link to another set on the same page (#set-id) opens that set.
  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").slice(1), s = h && S.sets.find(x => x.id === h);
    if (s && S.picked !== h) pick(s);
  });

  // ---------- ledgers ----------
  function rowHTML(s){
    const x = st(s);
    const past = s.status === "out_of_print" || s.status === "unknown";
    const when = past
      ? `<span class="lbl">Last known print</span><span class="val">${esc(fmt(s.lastPrint) || "Not documented")}</span>${s.release ? `<span class="lbl rel">Released ${esc(fmt(s.release))}</span>` : ""}`
      : `<span class="lbl">Released</span><span class="val">${esc(fmt(s.release) || "TBA")}</span>`;
    let host = ""; try { host = s.source ? new URL(s.source).hostname.replace(/^www\./, "") : ""; } catch(_){}
    // A source link shows only when it backs the status (or a past set's last print), not for release-date references.
    const src = /^https:\/\//.test(s.source || "") && (past || s.basis === "official" || s.basis === "historical")
      ? `<a class="srclink" href="${esc(s.source)}" target="_blank" rel="noopener" title="${esc(s.sourceName || host)}">Source: ${esc(s.sourceName || host)}</a>`
      : (past ? `<span>No official post yet</span>` : "");
    return `<li class="row">
      ${artHTML(s)}
      <div class="stamp ${x.cls}" role="img" aria-label="${x.label}">${x.short}</div>
      <div class="info">
        <h3><a href="#${esc(s.id)}" data-pick="${esc(s.id)}">${esc(s.name)}</a></h3>
        <div class="sub"><span>${esc(SHORT[s.game] || s.game)}</span>${s.code ? `<span>${esc(s.code)}</span>` : ""}${s.basis ? `<span class="basis ${esc(s.basis)}">${BASIS[s.basis]||esc(s.basis)}</span>` : ""}${src}</div>
      </div>
      <div class="when">${when}</div>
    </li>`;
  }
  const LIMIT = 15;
  function ledger(key, list, emptyMsg){
    const all = S.showAll[key], shown = all ? list : list.slice(0, LIMIT);
    $("n-" + key).textContent = S.loaded ? String(list.length).padStart(2, "0") : "";
    $(key).innerHTML = shown.length ? shown.map(rowHTML).join("") +
      (list.length > LIMIT ? `<li class="more"><button class="btn" type="button" data-more="${key}">${all ? "Show fewer" : `Show all ${list.length}`}</button></li>` : "")
      : `<li class="empty">${emptyMsg}</li>`;
  }
  function renderArchive(list, emptyMsg){
    $("n-archive").textContent = S.loaded ? String(list.length).padStart(2, "0") : "";
    if (!list.length){ $("archive").innerHTML = `<li class="empty">${emptyMsg}</li>`; return; }
    const byGame = {};
    for (const s of list) (byGame[s.game] = byGame[s.game] || []).push(s);
    const newest = (a,b) => String(b.release||"").localeCompare(String(a.release||"")) || a.name.localeCompare(b.name);
    $("archive").innerHTML = Object.keys(byGame).sort().map(g => {
      const rows = byGame[g].sort(newest), key = "arc:" + g, all = S.showAll[key];
      const shown = all ? rows : rows.slice(0, LIMIT);
      const out = rows.filter(s => s.status === "out_of_print").length;
      const years = rows.map(s => String(s.release||"").slice(0,4)).filter(Boolean).sort();
      const span = years.length ? (years[0] === years[years.length-1] ? years[0] : `${years[0]}–${years[years.length-1]}`) : "";
      return `<li class="group"><span class="g">${esc(g)}</span><span class="c">${rows.length} past set${rows.length === 1 ? "" : "s"} · ${out} out of print${span ? " · " + span : ""}</span></li>` +
        shown.map(rowHTML).join("") +
        (rows.length > LIMIT ? `<li class="more"><button class="btn" type="button" data-more="${esc(key)}">${all ? "Show fewer" : `Show all ${rows.length} ${esc(SHORT[g] || g)} sets`}</button></li>` : "");
    }).join("");
  }

  function render(){
    const games = [...new Set(S.sets.map(s => s.game).filter(Boolean))].sort();
    const on = (set, v) => v === "all" ? set.size === 0 : set.has(v);
    cellsHTML($("gameCells"), [["all","All games"], ...games.map(g => [g, SHORT[g] || g])].map(([v,l]) =>
      `<button class="cell" type="button" data-game="${esc(v)}" aria-pressed="${on(S.games, v)}" title="${esc(v === "all" ? "Show every game" : v)}">${esc(l)}</button>`));
    cellsHTML($("statusCells"), [["all","Any status"],["in_print","In print"],["out_of_print","Out of print"],["unknown","No official word"],["upcoming","Coming soon"]].map(([v,l]) =>
      `<button class="cell" type="button" data-status="${v}" aria-pressed="${on(S.statuses, v)}">${l}</button>`));
    const c = k => S.sets.filter(s => s.status === k).length;
    const n = v => S.loaded ? v : "–";
    cellsHTML($("tally"), [
      [n(S.sets.length), "", "Sets tracked"], [n(c("in_print")), "yes", "In print"], [n(c("out_of_print")), "no", "Out of print"],
      [n(c("unknown")), "maybe", "No official word"], [n(c("upcoming")), "soon", "Coming soon"]
    ].map(([v, cls, l]) => `<div class="cell"><span class="num ${cls}">${v}</span>${l}</div>`));
    const latest = S.sets.map(s => s.checked).filter(Boolean).sort().pop();
    $("mastMeta").textContent = latest ? `Official print status · updated ${fmt(latest)}` : "Official print status";
    $("banner").innerHTML = S.noDb ? `<div class="note">The set list didn't load. If you opened index.html straight from disk, run npm run dev and open the local address instead.</div>` : "";

    const gameOk = s => S.games.size === 0 || S.games.has(s.game);
    const v = S.sets.filter(s => gameOk(s) && (S.statuses.size === 0 || S.statuses.has(s.status)));
    const byRel = (a,b) => String(b.release||"").localeCompare(String(a.release||""));
    const cur = v.filter(s => s.status === "in_print" || s.status === "upcoming").sort((a,b) => (a.status==="upcoming"?0:1)-(b.status==="upcoming"?0:1) || byRel(a,b));
    // Archive: every past set (officially out of print, or no official word since release), grouped by game.
    // It always follows the game picks; it narrows by status only when Out of print or No official word is picked.
    const arcStatuses = [...S.statuses].filter(x => x === "out_of_print" || x === "unknown");
    const arc = S.sets.filter(s => gameOk(s) && (arcStatuses.length ? arcStatuses.includes(s.status) : (s.status === "out_of_print" || s.status === "unknown")));
    const emptyMsg = !S.loaded ? (S.noDb ? "Set list unavailable in this view." : "Loading sets…")
      : S.sets.length === 0 ? "No sets have been published yet." : "Nothing here with these filters.";
    ledger("current", cur, emptyMsg);
    const picked = [...S.games].sort().map(g => SHORT[g] || g);
    renderArchive(arc, S.loaded && S.sets.length ? "No past sets for the selected games and statuses." : emptyMsg);
    $("archiveGame").textContent = picked.length ? "· " + picked.join(", ") : "";
    $("clearQ").hidden = !S.q;
  }

  // ---------- events ----------
  const q = $("q");
  q.addEventListener("input", e => { S.q = e.target.value; S.open = true; S.active = S.q.trim() ? 0 : -1; renderSuggest(); $("clearQ").hidden = !S.q; });
  q.addEventListener("focus", () => { if (S.q.trim() && !S.picked){ S.open = true; renderSuggest(); } });
  q.addEventListener("keydown", e => {
    const n = sugg.length;
    if (e.key === "ArrowDown"){ e.preventDefault(); S.open = true; S.active = n ? (S.active + 1) % n : -1; renderSuggest(); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); S.active = n ? (S.active - 1 + n) % n : -1; renderSuggest(); }
    else if (e.key === "Enter"){ e.preventDefault(); if (S.open && n) pick(sugg[Math.max(0, S.active)]); }
    else if (e.key === "Escape"){ if (S.open){ S.open = false; renderSuggest(); } }
  });
  q.addEventListener("blur", () => setTimeout(() => { S.open = false; renderSuggest(); }, 120));
  $("suggest").addEventListener("mousedown", e => { const li = e.target.closest(".opt"); if (li){ e.preventDefault(); pick(sugg[+li.dataset.i]); } });
  $("clearQ").addEventListener("click", () => { S.q = ""; q.value = ""; S.open = false; renderSuggest(); clearPick(); render(); q.focus(); });

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-pick]");
    if (a){ e.preventDefault(); pick(S.sets.find(s => s.id === a.dataset.pick)); window.scrollTo({ top: 0, behavior: reduce() }); return; }
    const t = e.target.closest("button"); if (!t) return;
    const toggle = (set, v) => { if (v === "all") set.clear(); else if (set.has(v)) set.delete(v); else set.add(v); };
    if (t.dataset.game) { toggle(S.games, t.dataset.game); render(); }
    else if (t.dataset.status) { toggle(S.statuses, t.dataset.status); render(); }
    else if (t.dataset.more) { S.showAll[t.dataset.more] = !S.showAll[t.dataset.more]; render(); }
    else if (t.id === "closeAnswer") clearPick();
  });

  render();

  // ---------- data ----------
  try { const r = $("repoLink"); if (r && !/YOUR-NAME/.test(REPO_URL)) r.href = REPO_URL; } catch(_){}
  fetch("data/sets.json", { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(list => {
      S.sets = Array.isArray(list) ? list : [];
      S.loaded = true;
      const h = (location.hash || "").slice(1); const s = h && S.sets.find(x => x.id === h);
      if (s) { S.picked = h; S.q = s.name; q.value = s.name; }
      render(); renderAnswer();
    })
    .catch(() => { S.noDb = true; render(); });
})();
