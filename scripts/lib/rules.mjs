// Time-based rules. These never invent a status: they only apply what the
// publisher already announced (a release date) and the 12-month "current release" window.
import { fullDate, monthsAgo, today as todayStr } from "./data.mjs";

export const CURRENT_WINDOW_MONTHS = 12;

const NO_WORD_NOTE = "The publisher hasn't posted a reprint or an end-of-print notice for this set. Retailer and hobby reports don't count here.";

export function applyRules(sets, { now = new Date(), windowMonths = CURRENT_WINDOW_MONTHS } = {}) {
  const today = todayStr(now);
  const cutoff = monthsAgo(today, windowMonths);
  const month = today.slice(0, 7);
  const changes = [];

  const next = sets.map(s => {
    const release = fullDate(s.release);
    // A release with only a year or month isn't precise enough to flip on.
    const exact = /^\d{4}-\d{2}-\d{2}$/.test(String(s.release || ""));

    if (s.status === "upcoming" && exact && release <= today) {
      const inWindow = release >= cutoff;
      changes.push({ id: s.id, name: s.name, game: s.game, from: "upcoming", to: inWindow ? "in_print" : "unknown", why: `Released ${s.release}` });
      return {
        ...s,
        status: inWindow ? "in_print" : "unknown",
        basis: inWindow ? "current" : "none",
        notes: inWindow ? `Released ${s.release}. The publisher's current release, with no end-of-print notice.` : NO_WORD_NOTE,
        checked: month,
      };
    }

    if (s.status === "in_print" && s.basis === "current" && release && release < cutoff) {
      changes.push({ id: s.id, name: s.name, game: s.game, from: "in_print", to: "unknown", why: `Released more than ${windowMonths} months ago with no official reprint or end-of-print news` });
      return { ...s, status: "unknown", basis: "none", notes: NO_WORD_NOTE, checked: month };
    }

    return s;
  });

  return { sets: next, changes };
}
