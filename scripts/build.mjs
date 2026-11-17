#!/usr/bin/env node
// Copies the site and the data into dist/ for GitHub Pages or any static host.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib/data.mjs";

const dist = path.join(ROOT, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "data"), { recursive: true });
await cp(path.join(ROOT, "site"), dist, { recursive: true });
await cp(path.join(ROOT, "data", "sets.json"), path.join(dist, "data", "sets.json"));
// Card lists are optional: the site shows "No card list yet" until the first card update runs.
await cp(path.join(ROOT, "data", "cards"), path.join(dist, "data", "cards"), { recursive: true }).catch(() => {});
console.log("Built dist/");
