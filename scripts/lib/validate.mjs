// Checks every set against the data rules. Returns a list of problems; empty means valid.
import { STATUSES, BASES } from "./data.mjs";

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-\d{2}$/;

export function isOfficialUrl(url, game, official) {
  const pub = official.publishers.find(p => p.game === game);
  if (!pub || typeof url !== "string") return false;
  return pub.prefixes.some(prefix => url.startsWith(prefix));
}

export function validateSets(sets, official) {
  const problems = [];
  const seen = new Set();
  const games = new Set(official.publishers.map(p => p.game));

  sets.forEach((s, i) => {
    const where = s.id ? `"${s.id}"` : `entry #${i + 1}`;
    const bad = msg => problems.push(`${where}: ${msg}`);

    for (const f of ["id", "game", "name", "status", "basis"]) if (!s[f]) bad(`missing ${f}`);
    if (s.id && !ID.test(s.id)) bad("id must be lowercase letters, digits and single dashes");
    if (s.id && seen.has(s.id)) bad("duplicate id");
    seen.add(s.id);
    if (s.game && !games.has(s.game)) bad(`unknown game "${s.game}" (add its publisher to data/official-sources.json first)`);
    if (s.status && !STATUSES.includes(s.status)) bad(`status must be one of ${STATUSES.join(", ")}`);
    if (s.basis && !BASES.includes(s.basis)) bad(`basis must be one of ${BASES.join(", ")}`);
    if (s.release && !DATE.test(s.release)) bad("release must be YYYY, YYYY-MM or YYYY-MM-DD");
    if (s.lastPrint && !DATE.test(s.lastPrint)) bad("lastPrint must be YYYY, YYYY-MM or YYYY-MM-DD");
    if (s.checked && !MONTH.test(s.checked)) bad("checked must be YYYY-MM");
    if (s.aliases && !Array.isArray(s.aliases)) bad("aliases must be a list");
    for (const f of ["source", "ref", "imageUrl", "imageCredit"]) {
      if (s[f] && !/^https:\/\//.test(s[f])) bad(`${f} must be an https:// link`);
    }

    // The core rule: an Official status must point at the publisher's own site or account.
    if (s.basis === "official") {
      if (!s.source) bad("an Official status needs a source link");
      else if (!isOfficialUrl(s.source, s.game, official)) bad(`source ${s.source} isn't one of ${s.game}'s official sites in data/official-sources.json`);
    }
    // Which basis each status may use.
    const allowed = {
      in_print: ["official", "current"],
      out_of_print: ["official", "historical"],
      unknown: ["none"],
      upcoming: ["announced", "official"],
    }[s.status];
    if (allowed && s.basis && !allowed.includes(s.basis)) bad(`status ${s.status} can't use basis ${s.basis} (allowed: ${allowed.join(", ")})`);
    if (s.status === "upcoming" && !s.release && !/Q[1-4]|20\d\d/.test(s.notes || "")) bad("an upcoming set needs a release date or a note saying when");
  });

  return problems;
}
