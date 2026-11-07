import { test } from "node:test";
import assert from "node:assert/strict";
import { findImage, pageMatches } from "../scripts/lib/images.mjs";
import { extractLinks, matchingLinks } from "../scripts/lib/news.mjs";

const set = { name: "Base Set", game: "Pokémon" };
const summary = {
  title: "Base Set (Pokémon)", type: "standard", description: "Pokémon Trading Card Game expansion",
  thumbnail: { source: "https://upload.wikimedia.org/wikipedia/en/thumb/x/xx/Base.png/320px-Base.png" },
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Base_Set_(Pok%C3%A9mon)" } },
};

test("a Wikipedia page counts only when it names the game", () => {
  assert.equal(pageMatches(summary, set), true);
  assert.equal(pageMatches({ ...summary, description: "Geological feature" }, set), false);
  assert.equal(pageMatches({ ...summary, type: "disambiguation" }, set), false);
});

test("findImage links the Wikimedia image and its page", async () => {
  const calls = [];
  const fetcher = async url => { calls.push(url); if (url.includes("Base_Set_(Pok")) return summary; throw new Error("404"); };
  const img = await findImage(set, { fetcher });
  assert.match(img.imageUrl, /^https:\/\/upload\.wikimedia\.org\//);
  assert.equal(img.wikiTitle, "Base Set (Pokémon)");
});

test("findImage ignores images hosted anywhere else", async () => {
  const fetcher = async () => ({ ...summary, thumbnail: { source: "https://example.com/x.png" } });
  assert.equal(await findImage(set, { fetcher }), null);
});

test("news links are filtered by print keywords", () => {
  const html = `<a href="/news/reprint-update">Prismatic Evolutions reprint update</a>
    <a href="https://www.pokemon.com/us/news/new-movie">New movie</a>
    <a href="/news/2026/back-in-stock"><span>Back in stock</span> this week</a>`;
  const links = matchingLinks(extractLinks(html, "https://www.pokemon.com/us/pokemon-news"), ["reprint", "back in stock"]);
  assert.deepEqual(links.map(l => l.href), ["https://www.pokemon.com/news/reprint-update", "https://www.pokemon.com/news/2026/back-in-stock"]);
});
