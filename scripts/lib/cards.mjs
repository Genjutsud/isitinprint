// Card lists and prices. Pure parsers, so they can be tested without the network.
//
// Each set's cards are saved as data/cards/<set id>.json:
//   { setId, game, source, sourceUrl, priceNote, updated, cards: [{ n, name, r, p, pf, img, tp }] }
//     n   card number          name  card name        r  rarity
//     p   market price (USD)   pf    foil price (USD), when the source has one
//     img small card image (only from hosts that allow linking)
//     tp  TCGplayer product link, when the source gives one
//
// Prices are market estimates for raw (ungraded) cards. They don't need an official source:
// the official-only rule covers print status, not prices.

// Card pictures are linked from these hosts, never copied. TCGplayer's image server covers every
// game, including the ones whose own sources don't offer pictures (YGOPRODeck asks sites not to
// hotlink its images; Lorcast and TCGCSV don't serve them for linking).
export const CARD_IMAGE_HOSTS = ["https://images.pokemontcg.io/", "https://cards.scryfall.io/", "https://tcgplayer-cdn.tcgplayer.com/"];

const num = v => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
};
const okImg = u => (typeof u === "string" && CARD_IMAGE_HOSTS.some(h => u.startsWith(h)) ? u : undefined);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

// Natural sort for card numbers: "2" < "10" < "TG01", and "LOB-EN002" < "LOB-EN010".
export function compareNumbers(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

// ---- Pokémon (pokemontcg.io) ----
const PKM_PRICE_ORDER = ["holofoil", "normal", "1stEditionHolofoil", "unlimitedHolofoil", "1stEdition", "unlimited", "reverseHolofoil"];
export function parsePokemonCards(json) {
  return (json.data || []).map(c => {
    const prices = c.tcgplayer?.prices || {};
    const key = PKM_PRICE_ORDER.find(k => prices[k]?.market != null || prices[k]?.mid != null);
    const p = key ? num(prices[key].market ?? prices[key].mid) : undefined;
    const pf = key !== "reverseHolofoil" ? num(prices.reverseHolofoil?.market) : undefined;
    return clean({ n: c.number, name: c.name, r: c.rarity, p, pf, img: okImg(c.images?.small), tp: c.tcgplayer?.url });
  });
}

// ---- Magic (Scryfall) ----
export function parseScryfallCards(json) {
  return (json.data || []).filter(c => !c.digital).map(c => clean({
    n: c.collector_number, name: c.name, r: c.rarity && c.rarity[0].toUpperCase() + c.rarity.slice(1),
    p: num(c.prices?.usd), pf: num(c.prices?.usd_foil),
    img: okImg(c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small),
    tp: c.purchase_uris?.tcgplayer,
  }));
}

// ---- Yu-Gi-Oh! (YGOPRODeck) ----
// One card can be printed in many sets; keep only its printings in this set. YGOPRODeck asks
// sites not to hotlink its images, so no image is stored.
export function parseYugiohCards(json, setName) {
  const out = [];
  for (const c of json.data || []) {
    for (const p of c.card_sets || []) {
      if (p.set_name !== setName) continue;
      out.push(clean({ n: p.set_code, name: c.name, r: p.set_rarity, p: num(p.set_price) }));
    }
  }
  return out;
}

// ---- Lorcana (Lorcast) ----
export function parseLorcastCards(json) {
  return (Array.isArray(json) ? json : json.results || []).map(c => clean({
    n: c.collector_number, name: c.version ? `${c.name} – ${c.version}` : c.name,
    r: c.rarity && c.rarity.replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase()),
    p: num(c.prices?.usd), pf: num(c.prices?.usd_foil),
    tp: c.tcgplayer_id ? `https://www.tcgplayer.com/product/${c.tcgplayer_id}` : undefined,
  }));
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => compareNumbers(a.n ?? "", b.n ?? "") || a.name.localeCompare(b.name));
}

// Links that send people to price-check sites. Built from the card's name, number and set,
// so they work for every game without storing anything.
export function valuationLinks({ game, setName, card }) {
  const short = { "Pokémon": "Pokemon", "Magic: The Gathering": "MTG", "Disney Lorcana": "Lorcana", "One Piece Card Game": "One Piece", "Yu-Gi-Oh!": "Yugioh" }[game] || game;
  const q = [short, card.name, card.n, setName].filter(Boolean).join(" ");
  const enc = encodeURIComponent;
  return {
    tcgplayer: card.tp || `https://www.tcgplayer.com/search/all/product?q=${enc([card.name, setName].join(" "))}`,
    ebayRaw: `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}&LH_Sold=1&LH_Complete=1`,
    ebayGraded: `https://www.ebay.com/sch/i.html?_nkw=${enc(q + " PSA 10")}&LH_Sold=1&LH_Complete=1`,
    pricecharting: `https://www.pricecharting.com/search-products?q=${enc([short, card.name, card.n, setName].filter(Boolean).join(" "))}&type=prices`,
  };
}

// ---- TCGplayer (via TCGCSV) ----
// TCGplayer's own API no longer takes new developers. TCGCSV (tcgcsv.com) is a free community
// mirror of TCGplayer's catalog and prices, refreshed daily. It covers every game here,
// including One Piece, so it's the source for One Piece and the backup for the others.
export const TCGPLAYER_CATEGORY = {
  "Magic: The Gathering": 1,
  "Yu-Gi-Oh!": 2,
  "Pokémon": 3,
  "One Piece Card Game": 68,
  "Disney Lorcana": 71,
};

// TCGplayer group names often carry a series prefix ("SWSH07: Evolving Skies"); both forms are kept for matching.
export function parseTcgcsvGroups(json, game) {
  const out = [];
  for (const g of json.results || []) {
    const short = String(g.name || "").replace(/^[A-Za-z0-9.&' -]{1,12}:\s*/, "");
    const base = { game, code: g.abbreviation || "", apiId: g.groupId };
    out.push({ ...base, name: g.name });
    if (short && short !== g.name) out.push({ ...base, name: short });
  }
  return out;
}

const ext = (product, key) => (product.extendedData || []).find(e => e.name === key)?.value;
const MAIN_PRINTING = ["Normal", "Holofoil", "1st Edition Holofoil", "Unlimited Holofoil", "1st Edition", "Unlimited"];

// Cards are the products with a card number; sealed products (boxes, packs) have none and are skipped.
export function parseTcgcsvCards(productsJson, pricesJson) {
  const byProduct = {};
  for (const p of pricesJson.results || []) (byProduct[p.productId] = byProduct[p.productId] || []).push(p);
  return (productsJson.results || [])
    .filter(pr => ext(pr, "Number"))
    .map(pr => {
      const ps = byProduct[pr.productId] || [];
      const main = MAIN_PRINTING.map(n => ps.find(x => x.subTypeName === n)).find(Boolean)
        || ps.find(x => !/foil/i.test(x.subTypeName || "")) || ps[0];
      const foil = ps.find(x => x !== main && /foil/i.test(x.subTypeName || ""));
      return clean({
        n: ext(pr, "Number"), name: pr.name, r: ext(pr, "Rarity"),
        p: num(main?.marketPrice ?? main?.midPrice), pf: num(foil?.marketPrice),
        tp: /^https:\/\/www\.tcgplayer\.com\//.test(pr.url || "") ? pr.url : undefined,
        img: okImg(pr.imageUrl),
      });
    });
}

// "042/204", "42" and "#42" are the same card number; "LOB-EN001" stays as it is.
export function numberKey(n) {
  const s = String(n ?? "").trim().replace(/^#/, "");
  if (/^\d+(\/\d+)?$/.test(s)) return String(parseInt(s, 10));
  return s.split("/")[0].toUpperCase();
}

// Adds TCGplayer pictures (and product links) to cards whose own source has none, matching by
// card number. A card keeps anything it already has.
export function addTcgplayerImages(cards, tcgCards) {
  const byNum = {};
  for (const t of tcgCards) {
    const k = numberKey(t.n);
    if (k && !byNum[k] && (t.img || t.tp)) byNum[k] = t;
  }
  let added = 0;
  const out = cards.map(c => {
    const t = byNum[numberKey(c.n)];
    if (!t || c.img) return c;
    added++;
    return { ...c, img: t.img, tp: c.tp || t.tp };
  });
  return { cards: out, added };
}
