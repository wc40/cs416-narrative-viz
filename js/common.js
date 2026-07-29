/* ==========================================================================
   common.js. Shared scales, formatting, statistics, and DOM helpers.
   Loaded by both index.html (narrative) and exploration.html (exploration).
   ========================================================================== */

/* ---------- Region color scale ---------------------------------------------
   Okabe-Ito qualitative palette. The colors stay distinct for the three common
   types of color blindness, which D3's default schemeSet2 doesn't.
   -------------------------------------------------------------------------- */

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];

const REGION_COLOR = {
  Africa:   '#d55e00',
  Americas: '#0072b2',
  Asia:     '#cc79a7',
  Europe:   '#009e73',
  Oceania:  '#e69f00'
};

const NO_DATA_COLOR = '#b6bcc4';

const colorRegion = d3.scaleOrdinal()
  .domain(REGIONS)
  .range(REGIONS.map(r => REGION_COLOR[r]))
  .unknown(NO_DATA_COLOR);

/* ---------- Number formatting --------------------------------------------- */

const fmt = {
  /** 24,622,646,997,221 -> "24.6T" */
  compact: d3.format('~s'),

  /** Axis ticks: strip SI "G" in favour of "B" for a general audience. */
  axis(v) {
    const s = d3.format('~s')(v);
    return s.replace('G', 'B');
  },

  int: d3.format(','),
  fixed1: d3.format(',.1f'),

  /** Compact 3-significant-figure SI, e.g. 18.0T / 449B / 336M. */
  si3(v) {
    if (v == null || !isFinite(v)) return '—';
    return d3.format('.3~s')(v).replace('G', 'B');
  },

  usd(v) {
    if (v == null || !isFinite(v)) return '—';
    return '$' + d3.format(',.0f')(v);
  },

  /** Large magnitudes with a spelled-out unit, e.g. "24.6 trillion kWh" */
  magnitude(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    const abs = Math.abs(v);
    const tiers = [
      [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']
    ];
    for (const [size, word] of tiers) {
      if (abs >= size) return `${d3.format(',.1f')(v / size)} ${word}${unit ? ' ' + unit : ''}`;
    }
    return `${d3.format(',.0f')(v)}${unit ? ' ' + unit : ''}`;
  },

  pct(v, digits = 1) {
    if (v == null || !isFinite(v)) return '—';
    return d3.format(`,.${digits}f`)(v) + '%';
  }
};

/* ---------- Parsing ---------------------------------------------------------
   The CSVs use an empty string for "not reported". Coercing that with +d.field
   turns 89 of the 153 countries into zeros, which is wrong and invisible on a
   chart. num() keeps missing and zero separate.
   ---------------------------------------------------------------------------- */

/** Parse a CSV cell to a finite number, or null if blank or "..". */
function num(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s === '..' || s === 'NA' || s === 'N/A') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Positive values only, since log scales can't plot 0 or negatives. */
function numPos(value) {
  const n = num(value);
  return n != null && n > 0 ? n : null;
}

/**
 * Load a CSV and strip the leading UTF-8 BOM.
 *
 * All four files start with a BOM and d3.csv doesn't remove it, so the first
 * column header parses as "﻿country" and d.country comes back undefined.
 * Browsers hide this because fetch strips the BOM inside response.text(), but
 * that only holds in a browser. It breaks under Node, jsdom, or any loader that
 * isn't fetch. Stripping it here means the parse works the same everywhere.
 */
function csvLoad(path, rowFn) {
  return d3.text(path).then(text =>
    d3.csvParse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text, rowFn)
  );
}

/**
 * Load and type the cross-sectional country table (2020).
 * `greenShare` is null when renewables were not reported, NOT zero.
 */
function loadCountries(path = 'data/countries-2020.csv') {
  return csvLoad(path, d => ({
    country:        d.country,
    iso:            d.iso_code,
    region:         d.region,
    year:           num(d.year),
    population:     numPos(d.population),
    energyPerCap:   numPos(d.energy_per_capita),
    totalEnergy:    numPos(d.total_energy),
    incomePerCap:   numPos(d.income_per_capita),
    gdpPerCap:      numPos(d.gdp_per_capita),
    gdp:            numPos(d.gdp),
    // Reported renewables share; null => not reported by the source.
    greenShare:     num(d.renewables_share_energy),
    hasGreen:       num(d.renewables_share_energy) != null
  }));
}

/* ---------- Statistics ------------------------------------------------------ */

/**
 * OLS fit on log10(x) against log10(y). Returns the slope (an elasticity),
 * intercept, Pearson r, R², and n. Only positive pairs are used, since the log
 * of zero is undefined. Every variable here is complete and positive across all
 * 153 rows, so nothing actually gets dropped.
 */
function logLogRegression(rows, xKey, yKey) {
  const pts = rows
    .filter(d => d[xKey] > 0 && d[yKey] > 0)
    .map(d => [Math.log10(d[xKey]), Math.log10(d[yKey])]);

  const n = pts.length;
  if (n < 3) return { n, slope: NaN, intercept: NaN, r: NaN, r2: NaN, predict: () => NaN };

  const mx = d3.mean(pts, p => p[0]);
  const my = d3.mean(pts, p => p[1]);
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = sxy / Math.sqrt(sxx * syy);

  return {
    n, slope, intercept, r, r2: r * r,
    /** Predict y in original units for an x in original units. */
    predict: x => Math.pow(10, intercept + slope * Math.log10(x))
  };
}

/** Plain-English strength label for |r|, using the usual social science cutoffs. */
function strengthLabel(r) {
  const a = Math.abs(r);
  if (a < 0.2) return 'essentially none';
  if (a < 0.4) return 'weak';
  if (a < 0.6) return 'moderate';
  if (a < 0.8) return 'strong';
  return 'very strong';
}

/* ---------- Tooltip ---------------------------------------------------------
   One node per page, positioned with pageX/pageY so it stays put when the page
   is scrolled. The old version appended a new tooltip div on every redraw and
   used viewport-relative event.x, so divs piled up and the tooltip drifted.
   ---------------------------------------------------------------------------- */

function createTooltip() {
  let node = d3.select('body').select('.tooltip');
  if (node.empty()) {
    node = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .attr('role', 'status')
      .attr('aria-live', 'polite');
  }

  const OFFSET = 14;

  return {
    show(event, html) {
      node.html(html).style('opacity', 1);
      this.move(event);
    },
    move(event) {
      const el = node.node();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // Flip toward the inside of the viewport near the right/bottom edges.
      const overRight  = event.clientX + OFFSET + w > window.innerWidth - 8;
      const overBottom = event.clientY + OFFSET + h > window.innerHeight - 8;
      node
        .style('left', (overRight  ? event.pageX - w - OFFSET : event.pageX + OFFSET) + 'px')
        .style('top',  (overBottom ? event.pageY - h - OFFSET : event.pageY + OFFSET) + 'px');
    },
    hide() { node.style('opacity', 0); }
  };
}

/* ---------- Axis / layout helpers ------------------------------------------ */

/**
 * Tick values for a log scale. How many ticks per decade depends on how wide
 * the domain is. A fixed 1-3 pattern works fine across four decades but gives
 * you one lonely tick on a domain that only spans half a decade.
 */
function logTicks(domain) {
  const [lo, hi] = domain;
  if (!(lo > 0) || !(hi > lo)) return [];

  const decades = Math.log10(hi / lo);
  const mantissas =
    decades >= 2.5 ? [1, 3] :
    decades >= 1.2 ? [1, 2, 5] :
    decades >= 0.5 ? [1, 1.5, 2, 3, 5, 7] :
                     [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];

  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of mantissas) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Pad a [min,max] domain by a multiplicative factor (log-space friendly). */
function padLogDomain(domain, factor = 1.35) {
  return [domain[0] / factor, domain[1] * factor];
}

/** Render an SVG legend row into a container element. */
function renderRegionLegend(selector, { onToggle = null, includeNoData = true } = {}) {
  const root = d3.select(selector);
  root.selectAll('*').remove();

  const group = root.append('div').attr('class', 'legend-group');
  group.append('span').attr('class', 'legend-caption').text('Region');

  const state = new Map(REGIONS.map(r => [r, true]));

  group.selectAll('button.legend-item')
    .data(REGIONS)
    .join('button')
      .attr('class', 'legend-item')
      .attr('type', 'button')
      .attr('aria-pressed', 'true')
      .on('click', function (event, r) {
        if (!onToggle) return;
        state.set(r, !state.get(r));
        d3.select(this)
          .classed('is-off', !state.get(r))
          .attr('aria-pressed', String(state.get(r)));
        onToggle(new Set([...state].filter(([, on]) => on).map(([k]) => k)));
      })
      .call(sel => {
        sel.append('span')
          .attr('class', 'swatch')
          .style('background', r => REGION_COLOR[r]);
        sel.append('span').text(r => r);
      });

  if (includeNoData) {
    const nd = group.append('span').attr('class', 'legend-item');
    nd.append('span').attr('class', 'swatch hollow');
    nd.append('span').text('Renewables not reported');
  }

  return state;
}

/** Debounce for resize handlers. */
function debounce(fn, ms = 160) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
