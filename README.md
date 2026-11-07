# IsItInPrint

Search any trading card set and see whether it's still in print. Statuses come **only from official publisher news**. Retailer listings, rumors and influencer reports never change a status.

Covers Pokémon, Magic: The Gathering, Disney Lorcana, One Piece Card Game and Yu-Gi-Oh!, from Magic's Alpha (1993) to sets announced for 2027.

- **Live search:** suggestions as you type, matched on set name, code or nickname (for example "PRE", "Alpha" or "OP-05").
- **Multi-select filters:** pick any mix of games and statuses.
- **Archive:** out-of-print sets for the games you pick, with the last known print run.
- **Set images:** linked from Wikipedia, or from the set's logo in a community set list. Nothing is copied into the repo.
- **No server:** one static page plus a JSON file. Hosts free on GitHub Pages.

## How a status is decided

| Status | Basis | Meaning |
|---|---|---|
| In print | `official` | The publisher announced a reprint or restock. |
| In print | `current` | Released by the publisher within the last 12 months, with no end-of-print notice. |
| Out of print | `official` | An end-of-print notice, or a publisher policy that rules the set out (for example Wizards' Reserved List). |
| Out of print | `historical` | The original publisher no longer makes the game (for example Wizards of the Coast's Pokémon sets). |
| No official word | `none` | The publisher hasn't said anything. |
| Coming soon | `announced` | Announced with a release date. It flips to In print on release day. |

`npm run validate` enforces this: an `official` status must link to a site or account listed for that game in [`data/official-sources.json`](data/official-sources.json). CI rejects anything else.

## Run it locally

You need Node 20 or newer. There are no dependencies to install.

```sh
git clone https://github.com/YOUR-NAME/isitinprint.git
cd isitinprint
npm run dev        # http://localhost:8080
npm test           # unit tests
npm run validate   # data rules
```

## Self-host on GitHub Pages (free)

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions** and tick **Allow GitHub Actions to create and approve pull requests**.
4. In `site/app.js`, set `REPO_URL` to your repo so the footer links to it.
5. Push to `main`. The **Publish site** workflow deploys it to `https://YOUR-NAME.github.io/isitinprint/`.

Any static host works too (Netlify, Cloudflare Pages, a plain web server): run `npm run build` and upload `dist/`.

## Keeping it up to date

Two scheduled jobs in [`.github/workflows/update.yml`](.github/workflows/update.yml) run every day for free on GitHub Actions:

**1. Data update → one pull request**

- **New sets** are found in free community set lists (pokemontcg.io, Scryfall, YGOPRODeck, Lorcast). They're added as Coming soon, In print (current release) or No official word, never as an official status.
- **Date rules:** sets flip to In print on release day and move to No official word 12 months later, unless the publisher has said more.
- **Images:** each set without one gets a Wikipedia lead image, but only when the page names the right game. When Wikipedia has nothing, it uses the set's logo from pokemontcg.io or its symbol from Scryfall. Only the link is stored, and the site loads the picture straight from that host. Up to 40 sets are tried each day, and Wikipedia is asked again every six months.

Nothing merges on its own. You review the PR, check new names and dates, then merge, and the site redeploys.

**2. Official news scraper → pull request**

`scripts/watch-news.mjs` reads each publisher's news page from `data/official-sources.json` and finds new posts that mention reprints, restocks or the end of printing. For each one it:

1. checks the post is on the publisher's own site,
2. reads the full post and works out which tracked sets it names,
3. drafts the change: **In print** for a reprint or restock, **Out of print** for an end-of-print notice, both with the post as the official source and this month as the last known print.

Drafted changes arrive as a **"Official print news: drafted changes"** pull request. Posts that don't name a set clearly enough go into an issue to read by hand. Each post is handled once, and up to 15 posts are read per run.

The scraper only matches words, so it can misread a post. That's why it drafts instead of publishing: open each linked post and confirm it says what the draft says before you merge.

Try it locally without changing anything: `node scripts/watch-news.mjs --dry-run`.

Optional: add a `POKEMONTCG_API_KEY` repository secret (free from pokemontcg.io) for higher rate limits.

### Adding older sets in bulk

The daily job only looks back 180 days, so it doesn't flood you with the whole catalog. To backfill a game on purpose:

```sh
node scripts/update.mjs --since 1999-01-01 --only "Pokémon" --no-images
```

Backfilled sets arrive as No official word. Give them a status only with an official source.

## Data format

Each entry in [`data/sets.json`](data/sets.json):

```json
{
  "id": "pokemon-prismatic-evolutions",
  "game": "Pokémon",
  "name": "Prismatic Evolutions",
  "code": "PRE",
  "aliases": ["Prismatic Evo"],
  "release": "2025-01-17",
  "status": "in_print",
  "basis": "official",
  "source": "https://x.com/PokemonTCG/status/1879574273544622582/photo/1",
  "sourceName": "The Pokémon Company (official, X)",
  "lastPrint": "2025-03",
  "lastPrintNote": "pokemon.com said it will continue to reprint impacted products",
  "notes": "Plain-language explanation shown on the answer card.",
  "ref": "https://…",
  "refName": "Where the release date came from",
  "imageUrl": "https://upload.wikimedia.org/…",
  "imageCredit": "https://en.wikipedia.org/wiki/…",
  "checked": "2026-11"
}
```

Set `wikiTitle` to point the image finder at an exact Wikipedia page. Set `"noImage": true` to stop it looking.

## Project layout

```
data/        sets.json, official-sources.json, seen-news.json
site/        index.html, styles.css, app.js (the whole front end)
scripts/     update, validate, watch-news, build, serve
  lib/       rules, detect, images, news, validate, data helpers
  sources/   community set-list adapters, one per game
test/        node:test suites with API-shaped fixtures
```

## Known gaps

- **One Piece Card Game** has no community set-list adapter yet, so new One Piece sets are added by hand. `scripts/sources/index.mjs` is the place to add one.
- **News pages:** some publisher news pages render with JavaScript and show no links to a simple fetch. The watcher reports those as unreadable. Swapping in an RSS feed or a different page URL in `official-sources.json` fixes it.
- **Images:** most individual sets don't have their own Wikipedia page, so most images will come from the Pokémon and Magic set lists. Lorcana, One Piece and Yu-Gi-Oh! sets without a Wikipedia page stay as placeholders until an image source is added for them in `scripts/sources/index.mjs`. Set logos and box art belong to their publishers. Wikipedia often shows them under fair use, so check that linking them suits your site.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: every status change needs a link to the publisher's own post.

## License

Code: [MIT](LICENSE). The set data is facts with sources; please keep the source links when you reuse it. Card names, set names and images are trademarks of their owners. This project isn't affiliated with any publisher.
