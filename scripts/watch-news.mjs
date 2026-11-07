#!/usr/bin/env node
// Reads each publisher's official news page and lists new posts that mention reprints,
// restocks or print runs. Writes .news.md (empty when nothing new) for the workflow to
// open as an issue, and remembers what it has already reported in data/seen-news.json.
// A person still reads the post and edits data/sets.json: this never changes a status itself.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJSON, ROOT } from "./lib/data.mjs";
import { extractLinks, matchingLinks } from "./lib/news.mjs";

const official = await readJSON(path.join(ROOT, "data", "official-sources.json"));
const seenPath = path.join(ROOT, "data", "seen-news.json");
let seen = [];
try { seen = JSON.parse(await readFile(seenPath, "utf8")); } catch {}
const seenSet = new Set(seen);

const fresh = [], failed = [];
for (const pub of official.publishers) {
  for (const page of pub.watch || []) {
    try {
      const res = await fetch(page, { headers: { "User-Agent": "IsItInPrint/1.0 news watcher" } });
      if (!res.ok) throw new Error(`${res.status}`);
      const links = matchingLinks(extractLinks(await res.text(), page), official.newsKeywords);
      for (const l of links) if (!seenSet.has(l.href)) { fresh.push({ ...l, game: pub.game, publisher: pub.publisher }); seenSet.add(l.href); }
    } catch (err) {
      failed.push(`${pub.publisher}: ${page} (${err.message})`);
    }
  }
}

let body = "";
if (fresh.length) {
  body = `Official news posts that mention print status. Read each one, then update data/sets.json with the post as the source.\n\n` +
    fresh.map(f => `- [ ] **${f.game}** (${f.publisher}): [${f.text}](${f.href})`).join("\n") + "\n";
}
if (failed.length) body += (body ? "\n" : "") + `Pages that couldn't be read (they may need a new URL in data/official-sources.json):\n` + failed.map(f => `- ${f}`).join("\n") + "\n";
await writeFile(path.join(ROOT, ".news.md"), fresh.length ? body : "");
await writeFile(seenPath, JSON.stringify([...seenSet].slice(-2000), null, 2) + "\n");
console.log(body || "No new print news.");
