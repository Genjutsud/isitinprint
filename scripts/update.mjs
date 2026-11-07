#!/usr/bin/env node
// Daily update: find new sets, apply release-day and 12-month rules, look up images.
// Writes data/sets.json and a .changes.md summary that the workflow uses as the PR body.
//
//   node scripts/update.mjs                 # everything
//   node scripts/update.mjs --no-detect     # skip the community set lists
//   node scripts/update.mjs --no-images     # skip Wikipedia
//   node scripts/update.mjs --since 1999-01-01 --only "Pokémon"   # one-off backfill
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSets, saveSets, ROOT } from "./lib/data.mjs";
import { applyRules } from "./lib/rules.mjs";
import { addNewSets, LOOKBACK_DAYS } from "./lib/detect.mjs";
import { findImage } from "./lib/images.mjs";
import { fetchAll } from "./sources/index.mjs";

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const now = new Date();
let sets = await loadSets();
const lines = [];
const warnings = [];

if (!flag("--no-detect")) {
  const only = opt("--only") ? [opt("--only")] : undefined;
  const since = opt("--since");
  const lookbackDays = since ? Math.ceil((now - new Date(since + "T00:00:00Z")) / 864e5) : LOOKBACK_DAYS;
  const { found, errors } = await fetchAll({ only });
  warnings.push(...errors.map(e => `Couldn't read a set list: ${e}`));
  const res = addNewSets(sets, found, { now, lookbackDays });
  sets = res.sets;
  if (res.added.length) {
    lines.push(`### New sets (${res.added.length})`, "", "Found in community set lists. Check each name and date against the publisher before merging.", "");
    for (const s of res.added) lines.push(`- **${s.name}** · ${s.game}${s.code ? ` · ${s.code}` : ""} · ${s.release} → ${s.status} ([list](${s.ref}))`);
    lines.push("");
  }
}

const rules = applyRules(sets, { now });
sets = rules.sets;
if (rules.changes.length) {
  lines.push(`### Status changes (${rules.changes.length})`, "");
  for (const c of rules.changes) lines.push(`- **${c.name}** · ${c.game}: ${c.from} → ${c.to}. ${c.why}.`);
  lines.push("");
}

if (!flag("--no-images")) {
  const missing = sets.filter(s => !s.imageUrl && !s.noImage);
  const limit = Number(opt("--image-limit") || 40); // stay well inside Wikipedia's polite-use limits
  const found = [];
  for (const s of missing.slice(0, limit)) {
    const img = await findImage(s);
    if (img) { Object.assign(s, img); found.push(s); }
    await new Promise(r => setTimeout(r, 200));
  }
  if (found.length) {
    lines.push(`### Images found on Wikipedia (${found.length})`, "", "Linked, not copied. Check each one shows the right set.", "");
    for (const s of found) lines.push(`- **${s.name}**: [page](${s.imageCredit}) · [image](${s.imageUrl})`);
    lines.push("");
  }
}

await saveSets(sets);
if (warnings.length) lines.push("### Warnings", "", ...warnings.map(w => `- ${w}`), "");
const body = lines.length
  ? `Automated data update for ${now.toISOString().slice(0, 10)}.\n\n${lines.join("\n")}\nPrint statuses only change from publisher news. Nothing here should be merged on the strength of a retailer listing or rumor.\n`
  : "";
await writeFile(path.join(ROOT, ".changes.md"), body);
console.log(body || "No changes.");
