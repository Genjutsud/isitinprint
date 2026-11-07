import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRules } from "../scripts/lib/rules.mjs";

const now = new Date("2026-11-06T12:00:00Z");

test("an upcoming set flips to In print on its release day", () => {
  const { sets, changes } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2026-11-06", status: "upcoming", basis: "announced" }], { now });
  assert.equal(sets[0].status, "in_print");
  assert.equal(sets[0].basis, "current");
  assert.equal(changes.length, 1);
});

test("an upcoming set stays upcoming before its release day", () => {
  const { sets, changes } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2026-11-07", status: "upcoming", basis: "announced" }], { now });
  assert.equal(sets[0].status, "upcoming");
  assert.equal(changes.length, 0);
});

test("an upcoming set with only a month never flips", () => {
  const { sets } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2026-10", status: "upcoming", basis: "announced" }], { now });
  assert.equal(sets[0].status, "upcoming");
});

test("a current release moves to No official word after 12 months", () => {
  const { sets, changes } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2025-11-05", status: "in_print", basis: "current" }], { now });
  assert.equal(sets[0].status, "unknown");
  assert.equal(sets[0].basis, "none");
  assert.equal(changes[0].to, "unknown");
});

test("a set still inside the 12-month window stays In print", () => {
  const { sets } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2025-11-07", status: "in_print", basis: "current" }], { now });
  assert.equal(sets[0].status, "in_print");
});

test("an officially in-print set is never aged out", () => {
  const { sets } = applyRules([{ id: "a", game: "Pokémon", name: "A", release: "2020-01-01", status: "in_print", basis: "official", source: "https://www.pokemon.com/x" }], { now });
  assert.equal(sets[0].status, "in_print");
});
