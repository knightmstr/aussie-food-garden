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
