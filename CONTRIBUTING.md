# Contributing

Thanks for helping keep IsItInPrint accurate. There's one rule everything else follows.

## The rule: publisher news only

A set's print status changes only when its publisher posts about it on its own site or official social account. Those sites and accounts are listed per game in [`data/official-sources.json`](data/official-sources.json).

These are **not** enough to change a status:

- retailer listings, restocks or "sold out" pages
- distributor emails or store owners
- YouTube, TikTok, Reddit, Discord or influencer posts
- price trends
- hobby news sites, unless they link straight to the publisher's post (link the post itself)

If the publisher hasn't said anything, the set stays **No official word**. That's a real answer, not a gap.

## Changing a status

1. Find the publisher's post.
2. Edit the set in `data/sets.json`:
   - `status`: `in_print` or `out_of_print`
   - `basis`: `official`
   - `source`: the post's URL
   - `sourceName`: for example `"Bandai (official, X)"`
   - `lastPrint` and `lastPrintNote`, when the post confirms a print run
   - `notes`: one or two plain sentences on what the publisher said
   - `checked`: this month, as `YYYY-MM`
3. Run `npm run validate` and `npm test`.
4. Open a pull request and paste the link in the description.

## Adding a set

Add an entry with `status: "upcoming"` and `basis: "announced"` before release, or `status: "unknown"` and `basis: "none"` for an older set. Use an `id` like `game-set-name` in lowercase with dashes, for example `lorcana-hyperia-city`. Add `aliases` for names people actually search for.

## Adding a game

1. Add the publisher to `data/official-sources.json`, with its official URL prefixes and a news page to watch.
2. Add its short id to `GAME_SLUG` in `scripts/lib/data.mjs`.
3. Optionally, add a set-list adapter in `scripts/sources/index.mjs`, with a fixture and a test in `test/`.

## Code changes

There are no dependencies. Keep it that way unless there's a strong reason. `npm test` must pass. The front end is plain HTML, CSS and JavaScript in `site/`. Check it at phone width and in dark mode.
