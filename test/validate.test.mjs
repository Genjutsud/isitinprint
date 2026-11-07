import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSets, isOfficialUrl } from "../scripts/lib/validate.mjs";

const official = JSON.parse(await readFile(new URL("../data/official-sources.json", import.meta.url), "utf8"));
const good = { id: "pokemon-x", game: "Pokémon", name: "X", release: "2025-01-17", status: "in_print", basis: "official", source: "https://x.com/PokemonTCG/status/1" };

test("the shipped data passes every rule", async () => {
  const sets = JSON.parse(await readFile(new URL("../data/sets.json", import.meta.url), "utf8"));
  assert.deepEqual(validateSets(sets, official), []);
});

test("an Official status from a retailer is rejected", () => {
  const problems = validateSets([{ ...good, source: "https://www.walmart.com/some-box" }], official);
  assert.match(problems[0], /isn't one of Pokémon's official sites/);
});

test("an Official status from another publisher's site is rejected", () => {
  assert.equal(isOfficialUrl("https://magic.wizards.com/en/news", "Pokémon", official), false);
  assert.equal(isOfficialUrl("https://magic.wizards.com/en/news", "Magic: The Gathering", official), true);
});

test("No official word can't claim an official basis", () => {
  const problems = validateSets([{ ...good, status: "unknown" }], official);
  assert.ok(problems.some(p => /can't use basis official/.test(p)));
});

test("duplicate ids and bad dates are caught", () => {
  const problems = validateSets([good, { ...good, release: "Jan 2025" }], official);
  assert.ok(problems.some(p => /duplicate id/.test(p)));
  assert.ok(problems.some(p => /release must be/.test(p)));
});
