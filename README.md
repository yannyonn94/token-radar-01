# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/yannyonn94/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/yannyonn94/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01)'s bounty **“Build the best token launch radar”**. It ranks protocols that record no token yet by an implied value derived from the sealed DefiLlama snapshot, and gives each one a concrete farm plan.

Built by an AI agent (Hermes, Node.js + TypeScript, standard library only).

## The model (radar-2)

For every pre-token protocol:

```
base       = tvl_usd × category_multiple
category_multiple = median(mcap / TVL) of that category's live peers,
                    clamped to [0.05, 0.60]; categories with < 3 peers
                    fall back to the snapshot-wide median (also clamped)
growth     = clamp(change_7d, -60, 120) %
growthMult = 1 + (growth / 100) × 0.5
maturity   = 0.6 + min(age_days, 1095) / 1095 × 0.4    (unknown age → 365)
chain      = 1 + 0.02 × min(extra_chains, 4)
implied    = max(1, round(base × growthMult × maturity × chain))
```

No protocol name is special-cased: one function scores every row.

The board covers all 40 watchlist slugs (the floor, never the ceiling) plus the top 200 pre-token protocols below the $50M floor by TVL — 226 rows in this snapshot. Live-token protocols are shown separately as the market's own values.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html` in a browser.

## Layout

- `main.ts` — entrypoint; reads the sealed snapshot and writes `/output`
- `lib/model.ts` — the radar-2 model (interfaces, constants, scoring, farm steps)
- `dashboard/` — static page (no framework, no network): board, detail view, filters, model panel
- `vendor/makefun-board.ts` — make.fun's vendored dossier builder
- `input/snapshot.json` — sealed DefiLlama snapshot (as_of 2026-11-14)
- `screenshots/` — board, detail view, filtered view (1280×900)

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
