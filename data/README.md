# Country dataset pipeline

`data/countries.json` is **generated** — do not edit it by hand. To regenerate it from public sources:

```
pip install -r data/requirements.txt
python data/build_countries.py
```

The script writes `data/countries.json` (alphabetical, ~193 UN member states) in the exact shape `higher-lower/app.js` reads. Re-runs hit `data/.cache/` (gitignored) and complete in seconds; pass `--no-cache` to refresh from the network.

## Sources

| Field | Source | Notes |
|---|---|---|
| `name`, `code`, `flag`, `capital`, `continent`, `population`, `area_km2` | [REST Countries v3.1](https://restcountries.com) | UN-member filter (`unMember: true`) defines the country list. |
| `gdp_per_capita_usd` | [World Bank Indicators API](https://api.worldbank.org/v2/) — `NY.GDP.PCAP.CD` | Most recent non-null annual value. |
| `passport_rank` | [ilyankou/passport-index-dataset](https://github.com/ilyankou/passport-index-dataset) (CC0) | Computed: count of visa-free / visa-on-arrival / e-visa destinations per passport, dense-ranked desc (1 = strongest). |
| `coastline_km` | [factbook/factbook.json](https://github.com/factbook/factbook.json) | Parsed out of the CIA World Factbook *Geography → Coastline* text. Some countries fall back to `null` if the entry is missing or unparseable. |

## CLI

```
python data/build_countries.py                # rebuild using cache
python data/build_countries.py --no-cache     # force network fetch
python data/build_countries.py --out path     # write somewhere else
```

## Adding a new stat to the site

1. Pick a source and add a `fetch_…()` function in `build_countries.py`.
2. Pass its output into `build_rows()` and emit a new key.
3. Re-run the script.
4. Add the key to `STAT_META` in `higher-lower/app.js` and a matching `<option>` in `higher-lower/index.html`.
