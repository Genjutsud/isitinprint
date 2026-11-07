// Turns discovered sets into new entries. Pure, so it can be tested without the network.
import { findMatch, makeId, fullDate, monthsAgo, today as todayStr } from "./data.mjs";
import { CURRENT_WINDOW_MONTHS } from "./rules.mjs";

export const LOOKBACK_DAYS = 180;

export function addNewSets(sets, found, { now = new Date(), lookbackDays = LOOKBACK_DAYS, windowMonths = CURRENT_WINDOW_MONTHS } = {}) {
  const today = todayStr(now);
  const since = new Date(now.getTime() - lookbackDays * 864e5).toISOString().slice(0, 10);
  const cutoff = monthsAgo(today, windowMonths);
  const month = today.slice(0, 7);
  const next = [...sets];
  const added = [];
  const ids = new Set(sets.map(s => s.id));

  for (const f of found) {
    const release = fullDate(f.release);
    // Only new and upcoming sets. Older catalog entries are backfilled on purpose, with --since.
    if (!release || release < since) continue;
    if (findMatch(next, f)) continue;

    let id = makeId(f.game, f.code || f.name);
    for (let n = 2; ids.has(id); n++) id = `${makeId(f.game, f.code || f.name)}-${n}`;
    ids.add(id);

    const upcoming = release > today;
    const current = !upcoming && release >= cutoff;
    const entry = {
      id, game: f.game, name: f.name, code: f.code || undefined, release: f.release,
      status: upcoming ? "upcoming" : current ? "in_print" : "unknown",
      basis: upcoming ? "announced" : current ? "current" : "none",
      notes: upcoming
        ? `Scheduled release. Status changes to In print on release day.`
        : current
          ? "The publisher's current release, out within the last 12 months, with no end-of-print notice."
          : "The publisher hasn't posted a reprint or an end-of-print notice for this set.",
      ref: f.ref, refName: f.refName, checked: month,
    };
    next.push(entry);
    added.push(entry);
  }
  return { sets: next, added };
}
