# Contributing

Corrections and better sources are very welcome.

## Ground rules

1. **Cite it or tag it.** Every factual claim needs a link to the page it came from. If it is your own reasoning, tag it `[inference]`; if you cannot source it, tag it `[general knowledge]` or leave it out.
2. **No invented products, rates or registration status.** Give them only when a source shows them, and say where.
3. **Say how strong the evidence is.** Government or university trial → strong or moderate. Practitioner guide → say so. Folklore → say so.
4. **Safety first.** Edible plants need safety notes (toxic parts, preparation, look-alikes). Sprays need bee and label cautions.
5. **Respect Indigenous knowledge.** Don't add wild-harvest advice for bush foods. Prefer Indigenous-led suppliers and name the source of the knowledge.

## Editing

- Content lives in `docs/` as markdown. Add a new page to `docs/nav.json` or the build will warn.
- Link between pages with relative `.md` links, for example `[aphids](../pests/insects.md#aphids)`.
- Run `npm run check` before opening a pull request. It checks links and menu entries.
- Keep tables narrow enough to read on a phone (five columns at most is a good guide).

## Area home screens and crop pages

The first screen, the area home pages (Darwin, Sydney) and the crop pages are driven by data, not by the long state pages:

- `site/areas/<area>.json` holds the month-by-month crop lists, the season labels, the "Get ready" and "What to get" lists, and the "Where next" links. Every line carries its source name. The month lists must match the sowing tables on the state pages (`docs/states/nt.md`, `docs/states/nsw-act.md`). If you change a table, change the JSON too.
- `docs/crops/<area>-<crop>.md` are the crop pages. They are listed under a hidden group in `docs/nav.json`, so they appear in search and on the area pages but not in the menu.
- `node scripts/build.mjs --strict` checks that every crop page and link in the area JSON exists.
- The app remembers the chosen area, the pots/backyard switch and ticked checklist items only in the browser's local storage on that device.

## Photos

Photos live in `docs/photos/` and are referenced from the markdown as `![alt](../photos/<id>.jpg)` followed by an italic line starting `*Photo:` (the app turns the pair into a captioned figure). All photos come from Wikimedia Commons under public domain, CC0, CC BY or CC BY-SA, and are listed in `docs/photo-credits.md`.

To add or change photos, run the manual "Fetch photos" workflow (Actions tab): `candidates` writes search results from `scripts/photo-items.json` to a `photos-candidates` branch for you to look at; put the Commons file titles you chose in `scripts/photo-picks.json` and run `final`, which re-checks each licence and writes the images and credits to a `photos-final` branch. Check by eye that each photo shows the right crop or pest before using it.
