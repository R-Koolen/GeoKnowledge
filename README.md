# GeoKnowledge

A small "higher or lower" geography quiz. Two countries appear side-by-side; you pick whether the right country's stat (passport power, GDP per capita, coastline, population, area) is higher or lower than the left. Score climbs until you miss.

## Run locally
The page uses `fetch()` to load `data/countries.json`, so you need a local web server (opening `index.html` directly via `file://` will not work).

```
python -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy on GitHub Pages
1. Push to `main` on GitHub.
2. Repo → **Settings** → **Pages**.
3. Source: *Deploy from a branch*. Branch: `main`. Folder: `/ (root)`.
4. Wait a minute, then visit the URL Pages shows you.

## Add more countries
Edit `data/countries.json` and append objects with the same shape:

```json
{
  "name": "France",
  "code": "FR",
  "flag": "🇫🇷",
  "capital": "Paris",
  "continent": "Europe",
  "population": 68000000,
  "area_km2": 643801,
  "coastline_km": 4853,
  "gdp_per_capita_usd": 46315,
  "passport_rank": 2
}
```

`passport_rank` follows the Henley index (1 = strongest); the game inverts it internally so "higher" always means "more powerful".

## Project layout
The site has a home page that links out to individual game pages. Each game lives in its own folder with its own HTML, CSS and JS. A single shared stylesheet at the root holds everything common (colours, layout, top bar, buttons); each page adds its own stylesheet for page-specific rules.

```
/
├── index.html          # home page
├── home.css            # home-only styles
├── styles.css          # shared base (used by every page)
├── data/
│   └── countries.json  # dataset, shared by all games
└── higher-lower/
    ├── index.html      # the Higher-or-Lower game page
    ├── style.css       # page-only styles
    └── app.js          # page-only logic
```

To add another game, create a sibling folder (e.g. `flag-quiz/`) with the same three files, and add a link to it from `index.html`.
