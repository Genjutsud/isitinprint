import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePokemonCards, parseScryfallCards, parseYugiohCards, parseLorcastCards, sortCards, valuationLinks } from "../scripts/lib/cards.mjs";

const fx = async name => JSON.parse(await readFile(new URL(`./fixtures/cards/${name}.json`, import.meta.url), "utf8"));

test("Pokémon cards take the TCGplayer market price and only allowed images", async () => {
  const cards = parsePokemonCards(await fx("pokemon"));
  const zard = cards.find(c => c.name === "Charizard");
  assert.equal(zard.p, 350.5);
  assert.equal(zard.pf, 12);
  assert.equal(zard.img, "https://images.pokemontcg.io/base1/4.png");
  const mewtwo = cards.find(c => c.name === "Mewtwo");
  assert.equal(mewtwo.p, 2);
  assert.equal(mewtwo.img, undefined);
  assert.equal(cards.find(c => c.name === "Blastoise").p, undefined);
});

test("Magic cards skip digital printings and read double-faced images", async () => {
  const cards = parseScryfallCards(await fx("scryfall"));
  assert.deepEqual(cards.map(c => c.name), ["Agate Assault", "Fire // Ice"]);
  assert.equal(cards[0].p, 0.05);
  assert.equal(cards[0].r, "Common");
  assert.match(cards[1].img, /^https:\/\/cards\.scryfall\.io\//);
});

test("Yu-Gi-Oh! keeps only this set's printings and ignores zero prices", async () => {
  const cards = parseYugiohCards(await fx("ygoprodeck"), "Legend of Blue Eyes White Dragon");
  assert.deepEqual(cards.map(c => c.n), ["LOB-EN001", "LOB-EN005"]);
  assert.equal(cards[0].p, 95.17);
  assert.equal(cards[1].p, undefined);
  assert.ok(cards.every(c => !c.img));
});

test("Lorcana cards include the version name and a TCGplayer link", async () => {
  const [elsa] = parseLorcastCards(await fx("lorcast"));
  assert.equal(elsa.name, "Elsa – Snow Queen");
  assert.equal(elsa.r, "Super Rare");
  assert.equal(elsa.tp, "https://www.tcgplayer.com/product/123456");
});

test("cards sort by number naturally", () => {
  const sorted = sortCards([{ n: "10", name: "b" }, { n: "2", name: "a" }, { n: "TG01", name: "c" }]);
  assert.deepEqual(sorted.map(c => c.n), ["2", "10", "TG01"]);
});

test("valuation links search sold listings for raw and PSA 10 copies", () => {
  const links = valuationLinks({ game: "Pokémon", setName: "Base Set", card: { n: "4", name: "Charizard" } });
  assert.match(links.ebayRaw, /LH_Sold=1/);
  assert.match(decodeURIComponent(links.ebayGraded), /Charizard 4 Base Set PSA 10/);
  assert.match(links.pricecharting, /^https:\/\/www\.pricecharting\.com\/search-products\?q=/);
  assert.match(links.tcgplayer, /^https:\/\/www\.tcgplayer\.com\/search/);
});

import { parseTcgcsvGroups, parseTcgcsvCards, TCGPLAYER_CATEGORY } from "../scripts/lib/cards.mjs";
import { findMatch } from "../scripts/lib/data.mjs";

test("TCGplayer groups match our sets by code or by name without the series prefix", async () => {
  const groups = parseTcgcsvGroups(await fx("tcgcsv-groups"), "One Piece Card Game");
  const op01 = { game: "One Piece Card Game", name: "Romance Dawn", code: "OP-01" };
  assert.equal(groups.find(f => findMatch([op01], f)).apiId, 3188);
  const pkm = parseTcgcsvGroups(await fx("tcgcsv-groups"), "Pokémon");
  const evs = { game: "Pokémon", name: "Evolving Skies", code: "EVS" };
  assert.equal(pkm.find(f => findMatch([evs], f)).apiId, 2848);
});

test("TCGplayer cards skip sealed products and read market, mid and foil prices", async () => {
  const cards = parseTcgcsvCards(await fx("tcgcsv-products"), await fx("tcgcsv-prices"));
  assert.deepEqual(cards.map(c => c.n), ["OP01-001", "OP01-025"]);
  assert.equal(cards[0].p, 4.25);
  assert.equal(cards[0].r, "Leader");
  assert.equal(cards[1].p, 12.5);
  assert.equal(cards[1].pf, 30.1);
  assert.equal(cards[1].tp, "https://www.tcgplayer.com/product/1002/one-piece-zoro");
});

test("every tracked game has a TCGplayer category", () => {
  for (const g of ["Pokémon", "Magic: The Gathering", "Yu-Gi-Oh!", "Disney Lorcana", "One Piece Card Game"]) assert.ok(TCGPLAYER_CATEGORY[g]);
});
