#!/usr/bin/env node
// Scrapes each publisher's official news page for posts about reprints, restocks or the end of
// printing, reads each new post, and drafts status changes for the sets it names.
//
// Output:
//   data/sets.json    drafted changes (the workflow puts them in a pull request, never straight to main)
//   .news.md          pull request / issue body; empty when there's nothing new
//   data/seen-news.json  posts already handled, so each one is reported once
//
//   node scripts/watch-news.mjs              # normal run
//   node scripts/watch-news.mjs --dry-run    # report only, don't touch sets.json or seen-news.json
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { readJSON, loadSets, saveSets, ROOT, today } from "./lib/data.mjs";
import { extractLinks, matchingLinks, htmlToText, draftChanges } from "./lib/news.mjs";
import { isOfficialUrl } from "./lib/validate.mjs";

const dryRun = process.argv.includes("--dry-run");
const MAX_ARTICLES = 15;
const official = await readJSON(path.join(ROOT, "data", "official-sources.json"));
const seenPath = path.join(ROOT, "data", "seen-news.json");
let seen = [];
try { seen = JSON.parse(await readFile(seenPath, "utf8")); } catch {}
const seenSet = new Set(seen);
const month = today().slice(0, 7);
const UA = { "User-Agent": "IsItInPrint/1.0 (open-source print status tracker)" };

async function getText(url) {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

// 1. Find new posts on each news page that mention print status.
const fresh = [], failed = [];
for (const pub of official.publishers) {
  for (const page of pub.watch || []) {
    try {
      const links = matchingLinks(extractLinks(await getText(page), page), official.newsKeywords);
      for (const l of links) {
        if (seenSet.has(l.href)) continue;
        // Only posts on the publisher's own site count.
        if (!isOfficialUrl(l.href, pub.game, official)) continue;
        fresh.push({ ...l, game: pub.game, publisher: pub.publisher });
      }
    } catch (err) {
      failed.push(`${pub.publisher}: ${page} (${err.message})`);
    }
  }
}

// 2. Read each post and draft changes for the sets it names.
let sets = await loadSets();
const drafted = [], unmatched = [];
for (const item of fresh.slice(0, MAX_ARTICLES)) {
  let text = "";
  try { text = htmlToText(await getText(item.href)); } catch (err) { failed.push(`${item.href} (${err.message})`); continue; }
  const changes = draftChanges({ title: item.text, text, href: item.href, game: item.game, publisher: item.publisher }, sets, { month });
  if (!changes.length) unmatched.push(item);
  for (const c of changes) {
    sets = sets.map(s => s.id === c.set.id ? { ...s, ...c.change } : s);
    drafted.push({ ...c, item });
  }
  seenSet.add(item.href);
  await new Promise(r => setTimeout(r, 300));
}

// 3. Write the summary.
const lines = [];
if (drafted.length) {
  lines.push(`### Drafted from official posts (${drafted.length})`, "",
    "Each change below came from a publisher post. Open the post and confirm it really says this about that set before merging.", "");
  for (const d of drafted) lines.push(`- [ ] **${d.set.name}** (${d.set.game}): ${d.set.status} → **${d.change.status}**, from [${d.item.text}](${d.item.href})`);
  lines.push("");
}
if (unmatched.length) {
  lines.push(`### Posts to read by hand (${unmatched.length})`, "",
    "These mention print status but didn't name a tracked set clearly enough to draft a change.", "");
  for (const u of unmatched) lines.push(`- [ ] **${u.game}**: [${u.text}](${u.href})`);
  lines.push("");
}
if (fresh.length > MAX_ARTICLES) lines.push(`${fresh.length - MAX_ARTICLES} more posts will be read on the next run.`, "");
if (failed.length && (drafted.length || unmatched.length)) {
  lines.push("### Couldn't read", "", ...failed.map(f => `- ${f}`), "");
}
const body = lines.length ? `Official print news for ${today()}.\n\n${lines.join("\n")}` : "";

if (!dryRun) {
  if (drafted.length) await saveSets(sets);
  await writeFile(seenPath, JSON.stringify([...seenSet].slice(-2000), null, 2) + "\n");
}
await writeFile(path.join(ROOT, ".news.md"), body);
// The workflow opens a pull request only when this marker file exists.
if (drafted.length && !dryRun) await writeFile(path.join(ROOT, ".news-drafted"), "yes");
else await rm(path.join(ROOT, ".news-drafted"), { force: true });
if (failed.length) console.warn("Pages that couldn't be read (they may need a new URL in data/official-sources.json):\n" + failed.map(f => `  - ${f}`).join("\n"));
console.log(body || "No new print news.");
