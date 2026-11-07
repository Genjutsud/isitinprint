#!/usr/bin/env node
// Tiny static server for local preview: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib/data.mjs";

const port = Number(process.argv[2] || 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = url === "/" ? "index.html" : url.slice(1);
  const base = rel.startsWith("data/") ? ROOT : path.join(ROOT, "site");
  const file = path.join(base, rel);
  const allowed = rel.startsWith("data/") ? path.join(ROOT, "data") + path.sep : base + path.sep;
  if (!file.startsWith(allowed)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`IsItInPrint running at http://localhost:${port}`));
