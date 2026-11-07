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

import { classify, setsInText, draftChanges, htmlToText } from "../scripts/lib/news.mjs";

const tracked = [
  { id: "pokemon-prismatic-evolutions", game: "Pokémon", name: "Prismatic Evolutions", code: "PRE", status: "in_print", basis: "official" },
  { id: "pokemon-destined-rivals", game: "Pokémon", name: "Destined Rivals", code: "DRI", status: "unknown", basis: "none" },
  { id: "pokemon-wotc-fo", game: "Pokémon", name: "Fossil", code: "FO", status: "out_of_print", basis: "historical" },
  { id: "mtg-bloomburrow", game: "Magic: The Gathering", name: "Bloomburrow", code: "BLB", status: "unknown", basis: "none" },
  { id: "onepiece-op-05", game: "One Piece Card Game", name: "Awakening of the New Era", code: "OP-05", status: "unknown", basis: "none" },
];

test("posts are classified as a reprint or an end of print", () => {
  assert.equal(classify("We are printing more Destined Rivals"), "reprint");
  assert.equal(classify("Booster boxes are back in stock"), "reprint");
  assert.equal(classify("One final print run before it goes out of print"), "end");
  assert.equal(classify("New movie trailer"), null);
});

test("sets are found by name or numbered code, but not by a common word", () => {
  const text = "Restock news for Destined Rivals and OP-05, plus fossil hunting tips.";
  assert.deepEqual(setsInText(text, tracked, "Pokémon").map(s => s.id), ["pokemon-destined-rivals"]);
  assert.deepEqual(setsInText(text, tracked, "One Piece Card Game").map(s => s.id), ["onepiece-op-05"]);
  assert.deepEqual(setsInText("Bloomburrow reprint", tracked, "Pokémon"), []);
});

test("a reprint post drafts an official In print change with the post as source", () => {
  const article = { title: "Destined Rivals reprint coming", text: "More product is on the way.", href: "https://www.pokemon.com/us/news/x", game: "Pokémon", publisher: "The Pokémon Company International" };
  const [d] = draftChanges(article, tracked, { month: "2026-11" });
  assert.equal(d.set.id, "pokemon-destined-rivals");
  assert.equal(d.change.status, "in_print");
  assert.equal(d.change.basis, "official");
  assert.equal(d.change.source, article.href);
  assert.equal(d.change.lastPrint, "2026-11");
});

test("a post is not drafted twice", () => {
  const sets = [{ ...tracked[0], source: "https://www.pokemon.com/us/news/y" }];
  const article = { title: "Prismatic Evolutions reprint", text: "", href: "https://www.pokemon.com/us/news/y", game: "Pokémon", publisher: "TPCi" };
  assert.deepEqual(draftChanges(article, sets, { month: "2026-11" }), []);
});

test("article text drops scripts and navigation", () => {
  assert.equal(htmlToText("<nav>Menu reprint</nav><script>x()</script><p>Hello&nbsp;there</p>"), "Hello there");
});
