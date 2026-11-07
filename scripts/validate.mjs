#!/usr/bin/env node
// Fails (exit 1) if data/sets.json breaks any data rule. Runs in CI on every pull request.
import path from "node:path";
import { loadSets, readJSON, ROOT } from "./lib/data.mjs";
import { validateSets } from "./lib/validate.mjs";

const sets = await loadSets();
const official = await readJSON(path.join(ROOT, "data", "official-sources.json"));
const problems = validateSets(sets, official);
if (problems.length) {
  console.error(`data/sets.json has ${problems.length} problem(s):\n` + problems.map(p => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`data/sets.json is valid: ${sets.length} sets.`);
