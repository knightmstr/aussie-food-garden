# Aussie Food Garden

A sourced, state-by-state guide to growing food in Australia that also looks after the local environment: what to plant and when, what grows well together, what to rotate or sow to keep soil fertile, and how to deal with pests and disease organically.

Everything is plain markdown in [`docs/`](docs/), so it reads fine on GitHub. The same files also power a small offline web app (installable on iPhone and Android) built from [`site/`](site/). The app has light and dark modes, a place picker for Darwin and Sydney with a per-month planting calendar, licensed photos for crops, pests and diseases (credits in [`docs/photo-credits.md`](docs/photo-credits.md)), and Darwin pest and disease notes from the NT Government field guide.

## Read it

- On GitHub: start at [`docs/index.md`](docs/index.md).
- As an app: see [Publishing](PUBLISHING.md) for the free GitHub Pages setup. Once it is live, open the link on your phone and use *Add to Home Screen* (iPhone, in Safari) or *Install app* (Android, in Chrome). It then works offline.

## How accurate is it?

The rule for this project is **no fabrication**.

- Facts come from cited pages (government agencies, research bodies, councils and a few community or commercial sources, each labelled as such).
- Text tagged `[inference]` is reasoning from sources. Text tagged `[general knowledge]` is not source-checked. Both should be confirmed locally.
- Every page ends with a **gaps** section that lists what could not be verified. Many official planting calendars are images or PDF grids, so some regions have thinner data than others.
- Product names, rates and registration status are given only where a source shows them. In Australia, always follow the product label or permit.
- Plants listed as native foods come with safety notes. Buy from Indigenous-led suppliers where you can and don't wild-harvest.

Found a mistake or a better source? Open an issue or pull request (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Repository layout

| Path | What it holds |
|---|---|
| `docs/` | All content as markdown, plus `docs/nav.json` (the menu) |
| `site/` | The web app: `index.html`, `app.js`, `style.css`, service worker, icons |
| `scripts/build.mjs` | Builds `dist/`, builds the search index, exports every table to `dist/data/tables.json`, and checks links |
| `.github/workflows/pages.yml` | Builds and deploys to GitHub Pages on every push to `main` |

## Run it locally

You need Node 18 or newer (and Python 3 for the tiny test server).

```sh
npm run check    # check links and menu entries only
npm run serve    # build and serve at http://localhost:8080
```

There are no dependencies to install. The markdown renderer ([marked](https://github.com/markedjs/marked), MIT) is bundled in `site/vendor/`.

## Using the data in a native app

`npm run build` writes `dist/data/tables.json`: every table in the guide as `{page, section, headers, rows}`. A native or cross-platform app can read that plus the markdown in `dist/content/`. See [Publishing](PUBLISHING.md) for the options.

## Licence

- Code (`site/`, `scripts/`, `.github/`): [MIT](LICENSE).
- Guide text (`docs/`): [CC BY 4.0](LICENSE-CONTENT.md). Linked sources keep their own copyright.
