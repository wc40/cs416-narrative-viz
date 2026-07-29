# Energy & Prosperity

An interactive narrative visualization asking a simple question: **what actually predicts how much energy an average person uses?**

Three candidate explanations — population, total GDP, and income per capita — are tested against energy consumption per capita across 153 countries in 2020. They turn out to be wildly unequal in explanatory power, and the reason is instructive.

**[View the visualization →](https://wc40.github.io/cs416-narrative-viz/)**

Built with D3 v7 and `d3-annotation`. No build step, no framework, no dependencies beyond two CDN scripts.

---

## The finding

| Scene | y-axis | n | Pearson r | R² | Log–log slope |
|---|---|---|---|---|---|
| 1 | Population | 153 | −0.13 | **0.017** | −0.15 |
| 2 | GDP (total) | 153 | 0.45 | **0.207** | 0.60 |
| 3 | Income per capita | 153 | 0.90 | **0.809** | 0.84 |

Population explains under 2% of the variation in energy use per person. Total GDP explains about 21%. Income per capita explains 81%.

The pattern is not a coincidence. The first two measures are **totals** — they scale with headcount, which is exactly the quantity the x-axis has already divided out. Once prosperity is measured the same way energy is, per person, the scatter collapses onto a line spanning four orders of magnitude.

The log–log slope of 0.84 is an **elasticity**: a 10% higher income per capita is associated with roughly 8% more energy consumed per person. It is slightly sub-linear, which is consistent with richer economies extracting more output per unit of energy.

---

## Structure

The design follows a **martini-glass** narrative: an author-driven stem, then a reader-driven bowl.

```
index.html         Three scenes over one shared scatter plot (the stem)
exploration.html   Free country-by-country exploration (the bowl)
css/styles.css     Shared design system
js/common.js       Shared scales, parsing, statistics, tooltip
data/              Four CSVs, documented below
```

Scene state lives in the URL hash (`#population`, `#gdp`, `#income`), so any scene is directly linkable and the browser back button behaves sensibly. Scenes advance by button, by progress dot, or with the ← / → arrow keys.

---

## Data

| File | Contents | Source |
|---|---|---|
| `data/countries-2020.csv` | 153 countries × 22 columns, cross-section for 2020 | OWID Energy + World Bank WDI |
| `data/income-per-capita-by-year.csv` | Adjusted net national income per capita, 2010–2020 | World Bank WDI |
| `data/energy-per-capita-by-year.csv` | Primary energy consumption per capita (kWh), 2010–2020 | OWID Energy |
| `data/energy-mix-2020.csv` | Share of primary energy by source, 56 countries | OWID Energy |

Primary sources: [Our World in Data — Energy](https://github.com/owid/energy-data) and the [World Bank World Development Indicators](https://data.worldbank.org/). Monetary values are constant 2015 US$.

### Definitions worth being precise about

- **Energy per capita** is *primary energy* consumption — electricity plus transport fuel, heating and industrial use — not electricity alone. The `data/energy-mix-2020.csv` breakdown is likewise a share of primary energy. This matters: the United States is 10.5% renewable by primary energy but roughly 20% by electricity generation, and quoting the wrong one overstates the case by a factor of two.
- **Income per capita** is adjusted net national income per capita, not GDP per capita. It nets out capital depreciation and natural-resource depletion, which makes it a better proxy for what residents actually have available — a meaningful distinction for resource exporters such as Norway and Qatar.

### Handling of missing values

The source CSVs use an empty string for "not reported". The obvious `+d.field` coercion turns those into `0`, which is wrong in a way that is invisible on a chart:

> `renewables_share_energy` is missing for **89 of 153 countries**. Coerced to zero, 58% of the bubbles would silently claim "0% renewable" when the truth is "unknown."

`num()` in `js/common.js` returns `null` for blank, `..`, `NA` and `N/A` instead. Countries with no renewables figure render as small grey circles with a dashed outline and are labelled as such in the legend, so absence of data is visually distinct from a value of zero.

The 64 countries that *do* report renewables skew wealthy, so any apparent relationship involving circle size is drawn from a non-random subset. It is presented as context, not as a finding. (For the record: renewable share against energy per capita among those 64 gives r = 0.30, R² = 0.09, with non-monotonic quartile medians — too weak to assert.)

### Other choices

- **Log–log axes.** Energy per capita spans roughly 1,000× and the other variables more. On linear axes, 140 countries would pile into the bottom-left corner.
- **Regression fit on positive values only.** Log transforms are undefined at zero, so the OLS in `logLogRegression()` uses strictly positive pairs. Every variable used here is complete and positive across all 153 rows, so nothing is silently dropped.
- **Circle area, not radius, encodes renewable share.** `d3.scaleSqrt` keeps the encoding perceptually honest; a linear radius scale exaggerates large values by squaring them.
- **Okabe–Ito colour palette.** Distinguishable under deuteranopia, protanopia and tritanopia, unlike D3's default `schemeSet2`.
- **Total energy was deliberately dropped** as a y-axis. `total_energy = energy_per_capita × population`, so regressing it on energy per capita is partly mechanical — the correlation is an artefact of shared terms rather than evidence.

---

## Limitations

These are cross-sectional correlations for a single year, not causal estimates. Rich countries can afford more energy, and abundant energy helps economies grow; this data cannot separate the two directions, and both are plausibly driven by third factors such as climate, industrial mix and urban density.

2020 is also an unusual reference year. Pandemic demand shocks depressed both energy use and income unevenly across countries, and the cross-section inherits that distortion.

---

## Running locally

The pages fetch CSVs over HTTP, so opening `index.html` directly from disk will trip the browser's `file://` CORS policy. Serve the directory instead:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Notes on the rebuild

This started as a course project for **CS 416 Data Visualization** (UIUC). It was later reworked; the substantive changes were:

- **`d3-annotation` was loaded from `rawgit.com`, which shut down in October 2019.** The library silently failed to load, so every annotation and every axis label — the entire narrative layer — was missing at runtime.
- **All data and navigation URLs were absolute** (`https://wc40.github.io/...`), so the project could not run locally and "Next" navigated away from any local copy. Now relative.
- **The CSVs begin with a UTF-8 BOM**, which `d3.csv` does not strip, so the first column parsed as `"﻿country"` and `d.country` was `undefined` — the original tooltips read "Country: undefined". Browsers mask this because the Fetch spec strips the BOM inside `response.text()`, but that is a platform accident; `csvLoad()` now strips it explicitly.
- **Missing renewables data was being coerced to zero** for 89 countries. See above.
- **The CSV was re-fetched on every scene change** and a new tooltip `<div>` was appended on every redraw. Data is now loaded once and the tooltip is a single reused node positioned in page coordinates, so it no longer drifts when the page is scrolled.
- **A claim in the original scene 2** — that countries using more energy per capita get more of it from green sources — is only weakly supported (r = 0.30) and rests on the non-random 64-country subset. It has been removed rather than restated.
- **Total energy was replaced by income per capita** as the third scene, both because the old pairing was mechanically correlated and because income per capita is the actual payoff of the argument.
- Dead files (`scene2.html`, `scene3.html`, an `Untitled/` duplicate of the whole project, two unused CSVs) removed; layout, typography, legends, axis titles, keyboard navigation and responsive sizing added.
