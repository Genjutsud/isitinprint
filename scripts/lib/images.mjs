// Finds a set's lead image on Wikipedia. Only the image URL and its page are stored;
// the site links to Wikimedia directly, so nothing is copied into the repo.
import { fetchJSON, norm } from "./data.mjs";

const GAME_WORDS = {
  "Pokémon": ["pokemon"],
  "Magic: The Gathering": ["magic", "gathering"],
  "Disney Lorcana": ["lorcana"],
  "One Piece Card Game": ["one piece"],
  "Yu-Gi-Oh!": ["yu gi oh", "yugioh"],
};

export function candidateTitles(set) {
  const short = { "Pokémon": "Pokémon", "Magic: The Gathering": "Magic: The Gathering", "Yu-Gi-Oh!": "Yu-Gi-Oh!" }[set.game];
  const t = [];
  if (set.wikiTitle) t.push(set.wikiTitle);
  if (short) t.push(`${set.name} (${short})`, `${set.name} (${short} set)`);
  t.push(set.name);
  return [...new Set(t)];
}

// A page counts only if Wikipedia's own description or opening text names the game.
export function pageMatches(summary, set) {
  if (!summary || summary.type === "disambiguation") return false;
  const text = norm(`${summary.description || ""} ${summary.extract || ""}`);
  return (GAME_WORDS[set.game] || []).some(w => text.includes(w));
}

export function imageFromSummary(summary) {
  const src = summary?.thumbnail?.source || summary?.originalimage?.source;
  if (!src || !/^https:\/\/upload\.wikimedia\.org\//.test(src)) return null;
  return {
    imageUrl: src,
    imageCredit: summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(summary.title || "")}`,
  };
}

export async function findImage(set, { fetcher = fetchJSON } = {}) {
  for (const title of candidateTitles(set)) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`;
    let summary;
    try { summary = await fetcher(url, { retries: 0 }); } catch { continue; }
    if (pageMatches(summary, set)) {
      const img = imageFromSummary(summary);
      if (img) return { ...img, wikiTitle: summary.title };
    }
  }
  return null;
}
