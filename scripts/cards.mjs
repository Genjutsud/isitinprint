#!/usr/bin/env node
// Fetches the card list and current market prices for each tracked set, from free community
// sources, and saves them to data/cards/<set id>.json plus a summary in data/cards/index.json.
//
//   node scripts/cards.mjs                       # every set that has a source
//   node scripts/cards.mjs --only "Pokémon"      # one game
//   node scripts/cards.mjs --set pokemon-151     # one set
//
//   node scripts/cards.mjs --source tcgplayer    # use TCGplayer data (via TCGCSV) for every set
//
// Sources: pokemontcg.io (Pokémon), Scryfall (Magic), YGOPRODeck (Yu-Gi-Oh!), Lorcast (Lorcana),
// and TCGplayer via TCGCSV for One Piece, and as the backup whenever another source fails
// or returns no prices.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSets, fetchJSON, findMatch, ROOT, today } from "./lib/data.mjs";
import { parsePokemonCards, parseScryfallCards, parseYugiohCards, parseLorcastCards, sortCards,
  TCGPLAYER_CATEGORY, parseTcgcsvGroups, parseTcgcsvCards } from "./lib/cards.mjs";
import { parsePokemon, parseScryfall, parseLorcast } from "./sources/index.mjs";

const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const only = opt("--only"), onlySet = opt("--set"), forceTcgplayer = opt("--source") === "tcgplayer";
const DIR = path.join(ROOT, "data", "cards");
const wait = ms => new Promise(r => setTimeout(r, ms));
const pkmHeaders = process.env.POKEMONTCG_API_KEY ? { "X-Api-Key": process.env.POKEMONTCG_API_KEY } : {};

await mkdir(DIR, { recursive: true });
const sets = (await loadSets()).filter(s => s.status !== "upcoming" && (!only || s.game === only) && (!onlySet || s.id === onlySet));

// Set lists are fetched once, to translate our sets into each source's own set ids.
const lookups = {};
async function lookup(game) {
  if (lookups[game]) return lookups[game];
  if (game === "Pokémon") {
    lookups[game] = parsePokemon(await fetchJSON("https://api.pokemontcg.io/v2/sets?pageSize=250", { headers: pkmHeaders }));
  } else if (game === "Magic: The Gathering") {
    lookups[game] = parseScryfall(await fetchJSON("https://api.scryfall.com/sets"));
  } else if (game === "Disney Lorcana") {
    lookups[game] = parseLorcast(await fetchJSON("https://api.lorcast.com/v0/sets"));
  } else {
    lookups[game] = [];
  }
  return lookups[game];
}

async function cardsFor(set) {
  if (set.game === "Yu-Gi-Oh!") {
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(set.name)}`;
    const json = await fetchJSON(url).catch(err => (String(err.message).startsWith("400") ? { data: [] } : Promise.reject(err)));
    return { cards: parseYugiohCards(json, set.name), source: "YGOPRODeck", sourceUrl: "https://ygoprodeck.com/", priceNote: "TCGplayer price for this printing, via YGOPRODeck" };
  }
  // Match by code, name or any of our aliases ("Base Set" is "Base" on pokemontcg.io).
  const match = (await lookup(set.game)).find(f => findMatch([set], f));
  if (!match?.apiId) return null;

  if (set.game === "Pokémon") {
    const cards = [];
    for (let page = 1; page < 20; page++) {
      const json = await fetchJSON(`https://api.pokemontcg.io/v2/cards?q=set.id:${match.apiId}&page=${page}&pageSize=250&select=number,name,rarity,images,tcgplayer`, { headers: pkmHeaders });
      cards.push(...parsePokemonCards(json));
      if ((json.page || page) * (json.pageSize || 250) >= (json.totalCount || 0)) break;
      await wait(200);
    }
    return { cards, source: "pokemontcg.io", sourceUrl: "https://pokemontcg.io/", priceNote: "TCGplayer market price, via pokemontcg.io" };
  }
  if (set.game === "Magic: The Gathering") {
    const cards = [];
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${match.apiId} -is:digital`)}&unique=prints&order=set`;
    while (url) {
      const json = await fetchJSON(url, { headers: { Accept: "application/json;q=0.9,*/*;q=0.8" } });
      cards.push(...parseScryfallCards(json));
      url = json.has_more ? json.next_page : null;
      await wait(120); // Scryfall asks for 50–100 ms between requests
    }
    return { cards, source: "Scryfall", sourceUrl: `https://scryfall.com/sets/${match.apiId}`, priceNote: "TCGplayer market price, via Scryfall" };
  }
  if (set.game === "Disney Lorcana") {
    const json = await fetchJSON(`https://api.lorcast.com/v0/sets/${encodeURIComponent(match.apiId)}/cards`);
    return { cards: parseLorcastCards(json), source: "Lorcast", sourceUrl: "https://lorcast.com/", priceNote: "TCGplayer price, via Lorcast" };
  }
  return null;
}

let index = {};
try { index = JSON.parse(await readFile(path.join(DIR, "index.json"), "utf8")); } catch {}
const updated = today();
const done = [], skipped = [], failed = [];

// TCGplayer data through TCGCSV: groups are fetched once per game, then products and prices per set.
const tcgGroups = {};
async function tcgplayerCards(set) {
  const cat = TCGPLAYER_CATEGORY[set.game];
  if (!cat) return null;
  if (!tcgGroups[set.game]) tcgGroups[set.game] = parseTcgcsvGroups(await fetchJSON(`https://tcgcsv.com/tcgplayer/${cat}/groups`), set.game);
  const match = tcgGroups[set.game].find(f => findMatch([set], f));
  if (!match) return null;
  const base = `https://tcgcsv.com/tcgplayer/${cat}/${match.apiId}`;
  const products = await fetchJSON(`${base}/products`);
  await wait(150);
  const prices = await fetchJSON(`${base}/prices`);
  return { cards: parseTcgcsvCards(products, prices), source: "TCGplayer (via TCGCSV)", sourceUrl: "https://tcgcsv.com/", priceNote: "TCGplayer market price, via TCGCSV" };
}

const usedBackup = [];
for (const set of sets) {
  try {
    let res = null, firstErr = null;
    if (!forceTcgplayer) {
      try { res = await cardsFor(set); } catch (err) { firstErr = err; }
    }
    // Fall back to TCGplayer data when the usual source has nothing, fails, or has no prices.
    if (forceTcgplayer || !res || !res.cards.length || !res.cards.some(c => c.p)) {
      const backup = await tcgplayerCards(set).catch(err => { if (!res && !firstErr) firstErr = err; return null; });
      if (backup && backup.cards.length) { res = backup; if (!forceTcgplayer && set.game !== "One Piece Card Game") usedBackup.push(set.name); }
    }
    if ((!res || !res.cards.length) && firstErr) throw firstErr;
    if (!res || !res.cards.length) { skipped.push(set.name); continue; }
    const cards = sortCards(res.cards);
    const file = { setId: set.id, game: set.game, name: set.name, source: res.source, sourceUrl: res.sourceUrl, priceNote: res.priceNote, updated, cards };
    await writeFile(path.join(DIR, `${set.id}.json`), JSON.stringify(file) + "\n");
    const priced = cards.filter(c => c.p);
    index[set.id] = { count: cards.length, priced: priced.length, top: priced.length ? Math.max(...priced.map(c => c.p)) : null, updated };
    done.push(`${set.name} (${cards.length})`);
  } catch (err) {
    failed.push(`${set.name}: ${err.message}`);
  }
  await wait(150);
}

const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path.join(DIR, "index.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(`Card lists saved for ${done.length} sets.`);
if (usedBackup.length) console.log(`Used TCGplayer data as the backup for ${usedBackup.length}: ${usedBackup.join(", ")}`);
if (skipped.length) console.log(`No card list available for ${skipped.length}: ${skipped.join(", ")}`);
if (failed.length) { console.warn(`Failed for ${failed.length}:\n  - ${failed.join("\n  - ")}`); }
