// Community set lists used only to DISCOVER new sets. They never change a set's print status.
// Each adapter returns [{ game, name, code, release, ref, refName, logo?, logoPage? }].
// "logo" is a hotlinkable set logo or symbol, used when Wikipedia has no image.
import { fetchJSON, fullDate } from "../lib/data.mjs";

const POKEMON_SKIP = /promo|trainer kit|mcdonald|energies|futsal|world championships|pop series|best of game|classic collection|trainer gallery|galarian gallery|shiny vault/i;
const MTG_SKIP = /mystery booster|jumpstart|alchemy|commander|playtest|the list/i;
const YUGIOH_SKIP = /tin|promo|deck|sneak peek|tournament|prize|starter|bundle|collector box|mat|sleeve|special edition|blister/i;

export function parsePokemon(json) {
  return (json.data || [])
    .filter(s => !POKEMON_SKIP.test(s.name))
    .map(s => ({
      game: "Pokémon", name: s.name, code: s.ptcgoCode || "", release: fullDate(s.releaseDate),
      ref: `https://pokemontcg.io/`, refName: "Pokémon TCG API (community)",
      logo: s.images?.logo || "", logoPage: "https://pokemontcg.io/",
    }));
}

export function parseScryfall(json) {
  const keep = new Set(["core", "expansion", "draft_innovation"]);
  return (json.data || [])
    .filter(s => keep.has(s.set_type) && !s.digital && !s.parent_set_code && !MTG_SKIP.test(s.name))
    .map(s => ({
      game: "Magic: The Gathering", name: s.name, code: String(s.code || "").toUpperCase(), release: s.released_at || "",
      ref: `https://scryfall.com/sets/${s.code}`, refName: "Scryfall (community)",
      logo: s.icon_svg_uri || "", logoPage: `https://scryfall.com/sets/${s.code}`,
    }));
}

export function parseYugioh(json) {
  return (Array.isArray(json) ? json : [])
    .filter(s => s.tcg_date && (s.num_of_cards || 0) >= 50 && !YUGIOH_SKIP.test(s.set_name))
    .map(s => ({
      game: "Yu-Gi-Oh!", name: s.set_name, code: s.set_code || "", release: s.tcg_date,
      ref: `https://ygoprodeck.com/`, refName: "YGOPRODeck (community)",
    }));
}

export function parseLorcast(json) {
  // Main sets have number codes ("14"); Illumineer's Quest boxes use "Q1", "Q2"…
  // Promo, format and collection codes ("P4", "PD1", "CC1", "Coconut") are skipped.
  return (json.results || [])
    .filter(s => /^(\d+|Q\d+)$/i.test(String(s.code || "")))
    .map(s => ({
      game: "Disney Lorcana", name: s.name, code: s.code ? `Set ${s.code}` : "", release: (s.released_at || "").slice(0, 10),
      ref: `https://lorcast.com/`, refName: "Lorcast (community)",
    }));
}

// One Piece Card Game: no free community API is wired in yet. New sets come from Bandai's
// official product page by hand, or add an adapter here (see CONTRIBUTING.md).

export const SOURCES = [
  { game: "Pokémon", url: "https://api.pokemontcg.io/v2/sets?orderBy=releaseDate&pageSize=250", parse: parsePokemon,
    headers: () => (process.env.POKEMONTCG_API_KEY ? { "X-Api-Key": process.env.POKEMONTCG_API_KEY } : {}) },
  { game: "Magic: The Gathering", url: "https://api.scryfall.com/sets", parse: parseScryfall },
  { game: "Yu-Gi-Oh!", url: "https://db.ygoprodeck.com/api/v7/cardsets.php", parse: parseYugioh },
  { game: "Disney Lorcana", url: "https://api.lorcast.com/v0/sets", parse: parseLorcast },
];

// Image hosts the site is allowed to link to. Images are never copied, only linked.
export const IMAGE_HOSTS = ["https://upload.wikimedia.org/", "https://images.pokemontcg.io/", "https://svgs.scryfall.io/"];

export async function fetchAll({ only } = {}) {
  const found = [], errors = [];
  for (const src of SOURCES) {
    if (only && !only.includes(src.game)) continue;
    try {
      const json = await fetchJSON(src.url, { headers: src.headers ? src.headers() : {} });
      found.push(...src.parse(json));
    } catch (err) {
      errors.push(`${src.game}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 150)); // be polite to free APIs
  }
  return { found, errors };
}
