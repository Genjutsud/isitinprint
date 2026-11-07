// Shared helpers for reading, writing and matching the set list.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SETS_PATH = path.join(ROOT, "data", "sets.json");

export const STATUSES = ["in_print", "out_of_print", "unknown", "upcoming"];
export const BASES = ["official", "current", "historical", "announced", "none"];

// Field order used when writing sets.json, so diffs stay small and readable.
const FIELD_ORDER = ["id", "game", "name", "code", "aliases", "release", "status", "basis", "source", "sourceName",
  "lastPrint", "lastPrintNote", "notes", "ref", "refName", "imageUrl", "imageCredit", "wikiTitle", "checked"];

export async function readJSON(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function loadSets(file = SETS_PATH) {
  return readJSON(file);
}

export function sortSets(sets) {
  return [...sets].sort((a, b) =>
    a.game.localeCompare(b.game) ||
    String(a.release || "9999").localeCompare(String(b.release || "9999")) ||
    a.name.localeCompare(b.name));
}

export function tidy(set) {
  const out = {};
  for (const k of FIELD_ORDER) {
    const v = set[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  for (const k of Object.keys(set)) if (!(k in out) && !FIELD_ORDER.includes(k) && set[k] !== undefined) out[k] = set[k];
  return out;
}

export async function saveSets(sets, file = SETS_PATH) {
  const text = JSON.stringify(sortSets(sets).map(tidy), null, 2) + "\n";
  await writeFile(file, text);
}

export function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function slug(s) {
  return norm(s).replace(/\s+/g, "-").slice(0, 80);
}

export const GAME_SLUG = {
  "Pokémon": "pokemon",
  "Magic: The Gathering": "mtg",
  "Disney Lorcana": "lorcana",
  "One Piece Card Game": "onepiece",
  "Yu-Gi-Oh!": "yugioh",
};

export function makeId(game, nameOrCode) {
  return `${GAME_SLUG[game] || slug(game)}-${slug(nameOrCode)}`;
}

// Finds an existing set that a discovered set refers to: same game and the same code, name or alias.
export function findMatch(sets, found) {
  const code = norm(found.code).replace(/\s/g, "");
  const name = norm(found.name);
  return sets.find(s => {
    if (s.game !== found.game) return false;
    if (code && norm(s.code).replace(/\s/g, "") === code) return true;
    if (norm(s.name) === name) return true;
    return (s.aliases || []).some(a => norm(a) === name);
  });
}

// Dates are compared as plain YYYY-MM-DD strings in UTC.
export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function monthsAgo(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

// Turns "2025-11", "2025-11-14" or "2025/11/14" into a comparable YYYY-MM-DD (first of month when no day).
export function fullDate(s) {
  if (!s) return "";
  const m = String(s).replace(/\//g, "-").match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return "";
  return `${m[1]}-${m[2] || "01"}-${m[3] || "01"}`;
}

export async function fetchJSON(url, { headers = {}, retries = 2 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "IsItInPrint/1.0 (+https://github.com)", Accept: "application/json", ...headers } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.json();
    } catch (err) {
      last = err;
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}
