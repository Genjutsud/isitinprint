// Reads official news: finds posts about print status, works out which sets they name,
// and drafts status changes. Every draft goes into a pull request for a person to approve.
import { norm } from "./data.mjs";

export function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let href;
    try { href = new URL(m[1], baseUrl).href; } catch { continue; }
    if (!/^https:\/\//.test(href)) continue;
    out.push({ href, text });
  }
  return out;
}

export function matchingLinks(links, keywords) {
  const kw = keywords.map(k => k.toLowerCase());
  const seen = new Set();
  return links.filter(l => {
    if (seen.has(l.href)) return false;
    const hit = kw.some(k => l.text.toLowerCase().includes(k) || l.href.toLowerCase().includes(k.replace(/\s+/g, "-")));
    if (hit) seen.add(l.href);
    return hit;
  });
}

// Plain text of an article: drops scripts, styles, navigation and footers, then tags.
export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

const END = /\b(out of print|end of (its )?print|final print(ing| run)|no longer (be )?(printed|produced|available)|discontinu(e|ed|ing)|last (print|printing))\b/i;
const REPRINT = /\b(reprint(s|ed|ing)?|restock(s|ed|ing)?|back in stock|print(ing)? more|additional (print|product|wave)s?|new (print|wave)|more product (is|will be) (coming|on the way)|while supplies last)\b/i;

// "end" beats "reprint" when a post says both ("one final reprint before it goes out of print").
export function classify(text) {
  if (END.test(text)) return "end";
  if (REPRINT.test(text)) return "reprint";
  return null;
}

// Sets of the given game whose name (or a long alias, or its code) appears in the text.
// Short or very common names are skipped so "Fossil" or "Legends" don't match by accident.
const TOO_COMMON = new Set(["base set", "fossil", "jungle", "legends", "the dark", "alpha", "beta", "fabled", "pitch black"]);
export function setsInText(text, sets, game) {
  const hay = ` ${norm(text)} `;
  return sets.filter(s => {
    if (s.game !== game) return false;
    const names = [s.name, ...(s.aliases || [])].map(norm).filter(n => n.length >= 6 && !TOO_COMMON.has(n));
    if (names.some(n => hay.includes(` ${n} `))) return true;
    const code = norm(s.code || "");
    return /\d/.test(code) && code.length >= 4 && hay.includes(` ${code} `);
  });
}

// Drafts changes for one article. Returns [{ set, change }] where change holds the new fields.
export function draftChanges(article, sets, { month }) {
  const kind = classify(`${article.title} ${article.text}`);
  if (!kind) return [];
  const hits = setsInText(`${article.title} ${article.text}`, sets, article.game);
  return hits.map(set => {
    if (kind === "end") {
      if (set.status === "out_of_print" && set.source === article.href) return null;
      return { set, kind, change: {
        status: "out_of_print", basis: "official", source: article.href, sourceName: `${article.publisher} (official)`,
        lastPrint: month, lastPrintNote: "Publisher announced the end of printing",
        notes: `${article.publisher} posted that printing has ended: "${article.title}". Check the post before merging.`, checked: month,
      } };
    }
    if (set.status === "in_print" && set.source === article.href) return null;
    return { set, kind, change: {
      status: "in_print", basis: "official", source: article.href, sourceName: `${article.publisher} (official)`,
      lastPrint: month, lastPrintNote: "Reprint or restock announced by the publisher",
      notes: `${article.publisher} announced more product: "${article.title}". Check the post before merging.`, checked: month,
    } };
  }).filter(Boolean);
}
