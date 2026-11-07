// Pulls links out of an official news page and keeps the ones that mention print status.
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
