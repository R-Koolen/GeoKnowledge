"""Build data/countries.json from public sources.

Each source is fetched once and saved as its own shard under data/raw/.
The merger reads from the shards, never from the network.

Refresh a stat:        rm data/raw/<stat>.json && python data/build_countries.py
Refresh everything:    rm -r data/raw && python data/build_countries.py
Add a new factbook stat:
    1. Write a tiny extract_*(fb) function below.
    2. Add a tuple to FACTBOOK_STATS: (output_field, shard_filename, extractor).
    3. Add a STAT_META entry + <option> in higher-lower/.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Callable

import requests

DATA = Path(__file__).resolve().parent
RAW = DATA / "raw"
OUT = DATA / "countries.json"


def load_or_build(path: Path, builder: Callable[[], Any]) -> Any:
    """Return contents of `path` if it exists, else call builder() and save."""
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    print(f"fetching {path.name}…")
    data = builder()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data


# --- fetchers --------------------------------------------------------------

def fetch_base() -> list[dict[str, Any]]:
    """REST Countries — UN members with the fields downstream sources need."""
    url = ("https://restcountries.com/v3.1/all"
           "?fields=name,cca2,cca3,capital,region,population,area,unMember,landlocked,borders")
    items = requests.get(url, timeout=30).json()
    rows = []
    for c in items:
        if not c.get("unMember"):
            continue
        caps = c.get("capital") or []
        rows.append({
            "name": c["name"]["common"],
            "code": c["cca2"],
            "cca3": c["cca3"],
            "capital": caps[0] if caps else None,
            "continent": c.get("region"),
            "population": c.get("population"),
            "area_km2": c.get("area"),
            "landlocked": bool(c.get("landlocked")),
            "borders": c.get("borders") or [],
        })
    rows.sort(key=lambda r: r["name"])
    return rows


def fetch_gdp(cca3_list: list[str]) -> dict[str, float]:
    """World Bank — most recent NY.GDP.PCAP.CD per country, keyed by ISO3."""
    url = ("https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD"
           "?format=json&per_page=20000&mrnev=1")
    payload = requests.get(url, timeout=60).json()
    if not isinstance(payload, list) or len(payload) < 2:
        return {}
    wanted = set(cca3_list)
    out: dict[str, float] = {}
    for row in payload[1] or []:
        iso3 = row.get("countryiso3code")
        value = row.get("value")
        if iso3 in wanted and value is not None:
            out[iso3] = round(float(value), 2)
    return out


_PASSPORT_RE = re.compile(
    r'data-pr="(\d+)"[^>]*data-vfs="(\d+)"[^>]*data-code="([a-z]{2})"',
    re.IGNORECASE,
)

def fetch_passport() -> dict[str, int]:
    """passportindex.org/byRank.php — official Global Passport Power Rank."""
    headers = {"User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )}
    html = requests.get("https://www.passportindex.org/byRank.php",
                        headers=headers, timeout=30).text
    return {code.upper(): int(rank)
            for rank, _vfs, code in _PASSPORT_RE.findall(html)}


# --- factbook.json: cache one file per country, then extract many stats ----

_FACTBOOK_FOLDERS = [
    "europe", "africa", "australia-oceania", "central-america-n-caribbean",
    "north-america", "south-america", "east-n-southeast-asia",
    "south-asia", "central-asia", "middle-east",
]

def fetch_factbook_files(base: list[dict[str, Any]]) -> None:
    """Download each UN-member factbook JSON once into raw/factbook/{cca2}.json.

    factbook.json uses lowercase ISO2 as the filename (e.g. `nl.json`), not a
    name slug. Folders are by region — we try each candidate until one resolves.
    """
    fb_dir = RAW / "factbook"
    fb_dir.mkdir(parents=True, exist_ok=True)
    missing = [r for r in base
               if not (fb_dir / f"{r['code'].lower()}.json").exists()]
    if not missing:
        return
    print(f"fetching factbook/ ({len(missing)} files)…")
    for r in missing:
        code = r["code"].lower()
        path = fb_dir / f"{code}.json"
        for folder in _FACTBOOK_FOLDERS:
            url = (f"https://raw.githubusercontent.com/factbook/factbook.json/"
                   f"master/{folder}/{code}.json")
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                path.write_text(resp.text, encoding="utf-8")
                break
        else:
            # No folder matched — write an empty marker so we don't retry every run
            path.write_text("{}", encoding="utf-8")


def load_factbook_files(base: list[dict[str, Any]]) -> dict[str, dict]:
    """Ensure files are cached, then return {ISO2: parsed_json}."""
    fetch_factbook_files(base)
    out: dict[str, dict] = {}
    for r in base:
        path = RAW / "factbook" / f"{r['code'].lower()}.json"
        try:
            out[r["code"]] = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            out[r["code"]] = {}
    return out


# Helpers for extractors ---------------------------------------------------

_NUM_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

def _walk(d: Any, *keys: str) -> Any:
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d

def _text(d: Any, *keys: str) -> str | None:
    """Walk keys; return inner 'text' if dict, the value if string."""
    n = _walk(d, *keys)
    if isinstance(n, dict):
        v = n.get("text")
        return v if isinstance(v, str) else None
    return n if isinstance(n, str) else None

def _first_number(text: str | None) -> float | None:
    if not text:
        return None
    m = _NUM_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group().replace(",", ""))
    except ValueError:
        return None

def _latest_year_text(node: Any, prefix: str) -> str | None:
    """For dicts whose keys are 'Foo 2024', 'Foo 2023', ... pick the latest year."""
    if not isinstance(node, dict):
        return None
    yearly = [(k, v) for k, v in node.items() if k.startswith(prefix)]
    if yearly:
        yearly.sort(reverse=True)
        v = yearly[0][1]
        return v.get("text") if isinstance(v, dict) else (v if isinstance(v, str) else None)
    # Fallback: maybe the dict directly holds a "text" key
    v = node.get("text")
    return v if isinstance(v, str) else None


# Per-stat extractors ------------------------------------------------------

def extract_coastline(fb: dict) -> float | None:
    text = _text(fb, "Geography", "Coastline")
    if not text:
        return None
    if "landlocked" in text.lower():
        return 0.0
    return _first_number(text)

def extract_life_expectancy(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society",
                                   "Life expectancy at birth", "total population"))

def extract_median_age(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Median age", "total"))

def extract_population_growth(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Population growth rate"))

def extract_obesity(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society",
                                   "Obesity - adult prevalence rate"))

def extract_alcohol(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society",
                                   "Alcohol consumption per capita"))

def extract_unemployment(fb: dict) -> float | None:
    node = _walk(fb, "Economy", "Unemployment rate")
    return _first_number(_latest_year_text(node, "Unemployment rate "))

def extract_highest_point(fb: dict) -> float | None:
    return _first_number(_text(fb, "Geography", "Elevation", "highest point"))

def extract_internet_users(fb: dict) -> float | None:
    return _first_number(_text(fb, "Communications", "Internet users",
                                   "percent of population"))


# Registry: (output_field_name, shard_filename, extractor)
FACTBOOK_STATS: list[tuple[str, str, Callable[[dict], Any]]] = [
    ("coastline_km",          "coastline.json",          extract_coastline),
    ("life_expectancy_years", "life_expectancy.json",    extract_life_expectancy),
    ("median_age_years",      "median_age.json",         extract_median_age),
    ("population_growth_pct", "population_growth.json",  extract_population_growth),
    ("obesity_pct",           "obesity_rate.json",       extract_obesity),
    ("alcohol_l_per_year",    "alcohol_per_capita.json", extract_alcohol),
    ("unemployment_pct",      "unemployment_rate.json",  extract_unemployment),
    ("highest_point_m",       "highest_point.json",      extract_highest_point),
    ("internet_users_pct",    "internet_users.json",     extract_internet_users),
]


def build_factbook_stat(extractor: Callable[[dict], Any],
                        files: dict[str, dict]) -> dict[str, float]:
    return {code: v for code, fb in files.items()
            if (v := extractor(fb)) is not None}


# --- merge -----------------------------------------------------------------

def main() -> None:
    base = load_or_build(RAW / "base.json", fetch_base)
    gdp  = load_or_build(RAW / "gdp.json",      lambda: fetch_gdp([r["cca3"] for r in base]))
    pp   = load_or_build(RAW / "passport.json", fetch_passport)

    fb_files = load_factbook_files(base)
    fb_stats: dict[str, dict[str, float]] = {}
    for field, shard, extractor in FACTBOOK_STATS:
        fb_stats[field] = load_or_build(
            RAW / shard,
            lambda e=extractor: build_factbook_stat(e, fb_files),
        )

    # Internal join keys that shouldn't appear in the public output.
    BASE_INTERNAL_KEYS = {"cca3"}

    rows = []
    for b in base:
        row = {k: v for k, v in b.items() if k not in BASE_INTERNAL_KEYS}
        row["gdp_per_capita_usd"] = gdp.get(b["cca3"])
        row["passport_rank"]      = pp.get(b["code"])
        for field, _shard, _extractor in FACTBOOK_STATS:
            row[field] = fb_stats[field].get(b["code"])
        # Trust REST Countries' landlocked flag over factbook parsing.
        if b.get("landlocked"):
            row["coastline_km"] = 0.0
        rows.append(row)
    rows.sort(key=lambda r: r["name"])

    OUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name} ({len(rows)} countries)")


if __name__ == "__main__":
    main()
