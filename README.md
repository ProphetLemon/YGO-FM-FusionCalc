## Yu-Gi-Oh! Forbidden Memories Fusion Calculator

Version: 0.9.0

Yu-Gi-Oh! Forbidden Memories is a terrible game with a terrible mechanic called
"fusions." Fusions allow the player to fuse two cards together to get a new,
hopefully more powerful card.

But, since it's a terrible game, YGO:FM does nothing to actually _tell_ you
about the fusions. Your options are to either try every card against every other
card (and by the way there's over 720 cards in the game) or to look it up
online. Oh, and the game doesn't try to record the fusions at all. And since
one card might fuse with a few _hundred_ other cards, trying to find out which
ones are worth it is tedious.

The real motivation for this project is Giver336's LP of the game on Something
Awful. His co-commentator, General Yeti, mused about the possibility of a
program to find the fusions for you. Here it is!

### About this fork

This repository is a fork of [Solumin/YGO-FM-FusionCalc](https://github.com/Solumin/YGO-FM-FusionCalc)
maintained by Diego Vidal del Rosal. It is undergoing a full rewrite from a
static site (jQuery + Bootstrap + TaffyDB, hosted on GitHub Pages) to a
server-rendered Node.js app (Express + EJS + TypeScript + Tailwind, deployed
on Render).

The rewrite is done in incremental steps under a Spec-Driven Development
process; see [.sdd/](.sdd/) for the SPECs and PLANs that drive each change.

### How to run locally

Requirements: Node 24 (see `.nvmrc`).

```sh
nvm use
npm install
npm run dev
```

The app will be available at http://localhost:3000.

### Build and start (production-like)

```sh
npm run build
npm start
```

### Tests

```sh
npm test          # Vitest unit tests with coverage
npm run test:e2e  # Playwright end-to-end tests
```

### Deployment

Deployed as a single Web Service on [Render](https://render.com) using
`render.yaml` at the repo root.

Live URL: https://ygo-fm-fusion-calc.onrender.com/

### Roadmap

The current focus is the migration to the new stack and a redesigned
calculator. Items below are tracked through SPECs in [.sdd/specs/](.sdd/specs/).

- [x] Node + TypeScript scaffolding and minimal Express server
- [x] Migrate pages to EJS templates with layouts and partials
- [x] Tailwind-based styling for all pages (legacy Bootstrap retained transitionally for the calculator/search dynamic markup)
- [x] i18n with Spanish (default) and English
- [ ] Port client scripts to TypeScript modules; remove jQuery, Bootstrap and TaffyDB
- [ ] Dynamic number of slots in the fusion calculator
- [ ] Chained fusion search (unlimited depth, optimised by final ATK)
- [ ] In-server domain layer with full unit-test coverage
- [ ] Real card images per card
- [ ] Filters and sorting by type, ATK/DEF and star
- [ ] Deck builder persisted in `localStorage`
- [ ] Detailed card view
- [ ] Fuzzy search
- [ ] Export / import of hands
- [ ] PWA / offline support

### Contributing

The project is mid-rewrite, so external contributions are paused until the
new stack lands. After that, PRs are welcome — they must follow the SDD flow
documented in [.sdd/context/conventions.md](.sdd/context/conventions.md).

A licence will be added once the rewrite reaches a stable point.

### Project Notes (transitional state)

The repository is currently a hybrid: the new Node/TS server in `src/server/`
serves the legacy static assets (`index.html`, `fusion-search.html`,
`fusion-calculator.html`, `about.html` plus `public/` and `data/`) untouched,
to keep the app working during the rewrite.

Legacy assets that will be removed in upcoming SPECs:

- `public/javascripts/{jquery,bootstrap,taffy,awesomplete}*.js` — vendored libraries.
- `public/javascripts/fusionCalc.js`, `fusionSearch.js` — to be ported to TypeScript modules.
- `public/styles/bootstrap.min.css` — to be replaced by Tailwind.
- `scripts/*.rb` — Ruby scripts that regenerate `data/*.json` derivatives from `Cards.json`; they will be rewritten as TypeScript scripts under `src/scripts/`.

Data files in `data/` (`Cards.json` and the generated `fusions.json`,
`equips.json`, `results.json`) remain the source of truth for the game data.

## Special Thanks

- Steve Kalynuik, Dylan Birtolo and Miguel Balauag, for the [Fusion FAQ](https://www.gamefaqs.com/ps/561010-yu-gi-oh-forbidden-memories/faqs/16613), an invaluable resource.
- The Yu-Gi-Oh! Wikia, for the list of cards that became the card database.
- [Solumin](https://github.com/Solumin) for the original project this fork is based on.
- [CathodeRaymond](https://github.com/CathodeRaymond) for the original CSS work.
- [duke1102](https://github.com/duke1102) for providing `Cards.json`, without which this project would be very inaccurate.
- marcos0000 for the Forbidden Memories logo in HD ([DeviantArt](https://www.deviantart.com/marcos0000)) and Carlos123321 for the VRAINS background ([DeviantArt](https://www.deviantart.com/carlos123321)).
- Giver336 for the .gif.
