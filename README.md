# Energy & Prosperity

An interactive narrative visualization built around one question: what predicts how much energy an average person uses?

I tested three candidate explanations against energy use per capita across 153 countries in 2020: population, total GDP, and income per capita. They turn out to be very unequal, and the reason why is the point of the piece.

**[View it here →](https://wc40.github.io/cs416-narrative-viz/)**

Built with D3 v7. No build step, no framework, one CDN script.

---

## What I found

| Scene | y-axis | n | Pearson r | R² | Log-log slope |
|---|---|---|---|---|---|
| 1 | Population | 153 | −0.13 | **0.017** | −0.15 |
| 2 | GDP (total) | 153 | 0.45 | **0.207** | 0.60 |
| 3 | Income per capita | 153 | 0.90 | **0.809** | 0.84 |

Population accounts for under 2% of the variation in energy use per person. Total GDP gets to about 21%. Income per capita gets to 81%.

That progression isn't a coincidence. The first two are **totals**, and totals scale with headcount, which is exactly what the x-axis already divides out. Once I measured prosperity the same way I measured energy, per person, the scatter pulls onto a line that holds across four orders of magnitude.

The 0.84 slope on log-log axes is an elasticity. A 10% higher income per capita comes with roughly 8% more energy used per person. It sits just under 1, which fits the idea that richer economies get somewhat more output per unit of energy.

---

## How it's laid out

The structure is a martini glass: an author-driven stem, then a reader-driven bowl.

```
index.html         Three scenes over one scatter plot (the stem)
exploration.html   Country-by-country exploration (the bowl)
css/styles.css     Shared styles
js/common.js       Shared scales, parsing, stats, tooltip
data/              Four CSVs, documented below
```

Scene state lives in the URL hash (`#population`, `#gdp`, `#income`), so any scene is linkable and the back button works. Scenes advance with the buttons, the progress dots, or the arrow keys.

The same three countries (Nigeria, the United States, Iceland) are annotated in every scene, and each one keeps a fixed corner of the plot. Only the connector line moves. That keeps the labels off the data and makes it easy to see where a country travels as the y-axis changes.

---

## Data

| File | What's in it | Source |
|---|---|---|
| `data/countries-2020.csv` | 153 countries × 22 columns, cross-section for 2020 | OWID Energy + World Bank |
| `data/income-per-capita-by-year.csv` | Adjusted net national income per capita, 2010–2020 | World Bank |
| `data/energy-per-capita-by-year.csv` | Primary energy use per capita in kWh, 2010–2020 | OWID Energy |
| `data/energy-mix-2020.csv` | Share of primary energy by source, 56 countries | OWID Energy |

Sources are [Our World in Data — Energy](https://github.com/owid/energy-data) and the [World Bank World Development Indicators](https://data.worldbank.org/). Money is in constant 2015 US dollars.

### Two definitions worth getting right

**Energy per capita is primary energy**, not electricity. It includes transport fuel, heating, and industrial use. The `energy-mix-2020.csv` breakdown is a share of primary energy too. This matters more than it sounds: the US is 10.5% renewable by primary energy but around 20% by electricity generation, so labeling the chart wrong would overstate the number by a factor of two.

**Income per capita is adjusted net national income per capita**, not GDP per capita. It nets out capital depreciation and natural resource depletion, which makes it a better read on what residents actually have. That distinction matters for resource exporters like Norway and Qatar.

### Missing values

The CSVs use an empty string for "not reported." The obvious `+d.field` coercion turns those into zeros, which is wrong in a way you can't see on a chart:

> `renewables_share_energy` is missing for **89 of 153 countries**. Coerced to zero, 58% of the bubbles would be claiming "0% renewable" when the real answer is "unknown."

`num()` in `js/common.js` returns `null` for blank, `..`, `NA`, and `N/A` instead. Countries with no renewables figure draw as small gray circles with a dashed outline and are called out in the legend, so missing data looks different from a real zero.

The 64 countries that do report renewables skew wealthy, so anything involving circle size comes from a biased subset. I've left it in as context, not as a result. For the record, renewable share against energy per capita among those 64 gives r = 0.30 and R² = 0.09, with quartile medians that aren't even monotonic. Not enough to claim anything.

### Other choices

- **Log-log axes.** Energy per capita spans about 1,000× and the other variables span more. On linear axes 140 countries would collapse into the bottom-left corner.
- **The fit uses positive values only,** since log of zero is undefined. Every variable here is complete and positive across all 153 rows, so nothing actually gets dropped.
- **Circle area encodes renewable share, not radius.** `d3.scaleSqrt` keeps that honest. Scaling radius linearly squares the visual weight of large values.
- **Okabe-Ito color palette,** which stays distinct for the common types of color blindness. D3's default `schemeSet2` doesn't.
- **I dropped total energy as a y-axis.** `total_energy = energy_per_capita × population`, so regressing it against energy per capita is partly mechanical. The correlation comes from the shared term, not from anything real.

---

## Limitations

These are cross-sectional correlations from a single year, not causal estimates. Rich countries can afford more energy and cheap energy helps economies grow, and this data can't separate the two directions. Both are also plausibly driven by other things entirely, like climate, industrial mix, and urban density.

2020 is a strange year to use as a reference. Pandemic demand shocks hit energy use and income unevenly across countries, and the cross-section inherits that.

---

## Running it locally

The pages fetch CSVs over HTTP, so opening `index.html` straight off disk will hit the browser's `file://` CORS policy. Serve the folder instead:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Rebuild notes

This started as a course project for CS 416 Data Visualization at UIUC. I came back to it later and found a handful of things worth writing down.

**The annotations were never rendering.** `d3-annotation` was loading from `rawgit.com`, which shut down in October 2019. The script silently failed, so every annotation and every axis label was missing at runtime. That's the entire narrative layer of a narrative visualization.

I ended up dropping the library rather than repointing it at a live CDN. It rebuilds its whole layer whenever the data changes, so the country marks flickered out and back on every scene change, and its note backgrounds sat on top of the dots and swallowed the hover events. The marks are now drawn directly in `drawAnnotations()`: a keyed join on country name keeps the same three elements alive across scenes so they glide to their new positions, and the layer is `pointer-events: none` so hovering a labeled country still reaches its dot. That also means one less unmaintained dependency, since d3-annotation hasn't shipped a release since 2018.

**Everything pointed at absolute URLs.** Data and navigation both hardcoded `https://wc40.github.io/...`, so the project couldn't run locally at all and "Next" navigated away from any local copy.

**The CSVs start with a UTF-8 BOM,** which `d3.csv` doesn't strip. The first column parsed as `"﻿country"`, so `d.country` was `undefined` and the old tooltips literally read "Country: undefined." Browsers hide this because fetch strips the BOM inside `response.text()`, but that only holds in a browser. `csvLoad()` now strips it directly.

**Missing renewables data was being read as zero** for 89 countries. Covered above.

**The CSV was re-fetched on every scene change,** and a new tooltip `<div>` got appended on every redraw. Data now loads once, and the tooltip is a single reused node positioned in page coordinates so it doesn't drift when you scroll.

**One of the original claims doesn't hold.** Scene 2 said countries using more energy per capita get more of it from green sources. That's r = 0.30 on the biased 64-country subset. I took it out rather than restate it.

**Total energy became income per capita** in scene 3, both because the old pairing was mechanically correlated and because income per capita is the actual payoff of the argument.

I also deleted dead files (`scene2.html`, `scene3.html`, an `Untitled/` copy of the whole project, two unused CSVs) and added layout, legends, axis titles, keyboard nav, and responsive sizing.
