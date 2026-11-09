import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { addNewSets } from "../scripts/lib/detect.mjs";
import { parsePokemon, parseScryfall, parseYugioh, parseLorcast } from "../scripts/sources/index.mjs";

const fx = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const now = new Date("2026-11-06T12:00:00Z");
const existing = [
  { id: "pokemon-delta-reign", game: "Pokémon", name: "Delta Reign", release: "2026-11-06", status: "in_print", basis: "current" },
  { id: "mtg-star-trek", game: "Magic: The Gathering", name: "Star Trek", release: "2026-11-11", status: "upcoming", basis: "announced" },
];

test("Pokémon parser skips promos and normalizes dates", async () => {
  const sets = parsePokemon(await fx("pokemontcg"));
  assert.ok(sets.every(s => !/promo/i.test(s.name)));
  assert.equal(sets.find(s => s.name === "Delta Reign").release, "2026-11-06");
});

test("Scryfall parser keeps paper expansions only", async () => {
  const sets = parseScryfall(await fx("scryfall"));
  assert.deepEqual(sets.map(s => s.code).sort(), ["STR", "ZZZ"]);
});

test("Yu-Gi-Oh! parser drops tins and small products", async () => {
  const sets = parseYugioh(await fx("ygoprodeck"));
  assert.deepEqual(sets.map(s => s.name), ["Phantom Example Booster"]);
});

test("Lorcast parser reads set numbers", async () => {
  const sets = parseLorcast(await fx("lorcast"));
  assert.equal(sets[0].code, "Set 15");
});

test("new sets are added once, existing ones are matched by name or code", async () => {
  const found = [...parsePokemon(await fx("pokemontcg")), ...parseScryfall(await fx("scryfall"))];
  const { added } = addNewSets(existing, found, { now });
  const names = added.map(s => s.name).sort();
  assert.deepEqual(names, ["Example Future Set", "Zendikar Example"]);
  const future = added.find(s => s.name === "Example Future Set");
  assert.equal(future.status, "upcoming");
  assert.equal(future.basis, "announced");
  const recent = added.find(s => s.name === "Zendikar Example");
  assert.equal(recent.status, "in_print");
});

test("old catalog sets aren't backfilled unless asked", async () => {
  const found = [{ game: "Pokémon", name: "Base Set", release: "1999-01-09", ref: "https://pokemontcg.io/", refName: "x" }];
  assert.equal(addNewSets([], found, { now }).added.length, 0);
  assert.equal(addNewSets([], found, { now, lookbackDays: 365 * 30 }).added[0].status, "unknown");
});

test("set lists carry hotlinkable logos for the image fallback", async () => {
  const p = parsePokemon(await fx("pokemontcg")).find(s => s.name === "Delta Reign");
  assert.equal(p.logo, "https://images.pokemontcg.io/me5/logo.png");
  const m = parseScryfall(await fx("scryfall")).find(s => s.code === "STR");
  assert.equal(m.logo, "https://svgs.scryfall.io/sets/str.svg");
});

test("Lorcana promo and format sets are skipped, Illumineer's Quest boxes kept", async () => {
  const sets = parseLorcast(await fx("lorcast"));
  assert.deepEqual(sets.map(s => s.code), ["Set 15", "Set Q3"]);
});

test("an Illumineer's Quest box matches its existing entry by Lorcast's name", async () => {
  const existing = [{ id: "lorcana-the-great-hunny-rescue", game: "Disney Lorcana", name: "The Great Hunny Rescue", aliases: ["Hunny Rescue – Illumineer's Quest"], release: "2026-10-03", status: "in_print", basis: "current" }];
  const found = parseLorcast(await fx("lorcast")).filter(s => s.code === "Set Q3");
  assert.equal(addNewSets(existing, found, { now }).added.length, 0);
});
