"""Rebuild data/countries.json from public APIs / open datasets.

Run from the repo root:
    python data/build_countries.py                # build with on-disk cache
    python data/build_countries.py --no-cache     # ignore cache, hit network
    python data/build_countries.py --out path     # write somewhere else

Sources (all free, no API key):
- REST Countries v3.1            base rows + name/code/capital/continent/population/area/flag
- World Bank Indicators API      gdp_per_capita_usd (NY.GDP.PCAP.CD)
- ilyankou/passport-index-dataset passport_rank (computed from visa-free counts)
- factbook/factbook.json         coastline_km (parsed from CIA Factbook geography text)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
CACHE_DIR = DATA_DIR / ".cache"
DEFAULT_OUT = DATA_DIR / "countries.json"

REST_COUNTRIES_URL = (
    "https://restcountries.com/v3.1/all"
    "?fields=name,cca2,cca3,capital,region,population,area,flag,unMember"
)
WORLDBANK_URL = (
    "https://api.worldbank.org/v2/country/{cca3}/indicator/NY.GDP.PCAP.CD"
    "?format=json&per_page=20"
)
PASSPORT_MATRIX_URL = (
    "https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/"
    "passport-index-matrix-iso2.csv"
)
# REST Countries' region → factbook.json folder name.
FACTBOOK_REGION_DIR = {
    "Africa": "africa",
    "Americas": "central-america-n-caribbean",  # overridden per-country below
    "Asia": "east-n-southeast-asia",            # overridden per-country below
    "Europe": "europe",
    "Oceania": "australia-oceania",
    "Antarctic": "antarctica",
}
# factbook.json splits the world into many sub-folders; the safe approach is
# to try each candidate folder until one resolves.
FACTBOOK_CANDIDATE_DIRS = [
    "africa",
    "europe",
    "australia-oceania",
    "antarctica",
    "central-america-n-caribbean",
    "north-america",
    "south-america",
    "east-n-southeast-asia",
    "south-asia",
    "central-asia",
    "middle-east",
    "oceans",
]
FACTBOOK_FILE_URL = (
    "https://raw.githubusercontent.com/factbook/factbook.json/master/{folder}/{slug}.json"
)


# ---------------------------------------------------------------------------
# HTTP with on-disk cache + retries
# ---------------------------------------------------------------------------

def _cache_path(url: str) -> Path:
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
    return CACHE_DIR / f"{h}.bin"


def http_get(url: str, *, use_cache: bool = True, allow_404: bool = False) -> bytes | None:
    """GET with retries + on-disk cache. Returns body bytes or None on 404 if allow_404."""
    if use_cache:
        cp = _cache_path(url)
        if cp.exists():
            return cp.read_bytes()

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=30, headers={"User-Agent": "GeoKnowledge build"})
            if r.status_code == 404 and allow_404:
                return None
            r.raise_for_status()
            data = r.content
            if use_cache:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                _cache_path(url).write_bytes(data)
            return data
        except Exception as e:
            last_err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"GET failed after retries: {url} ({last_err})")


# ---------------------------------------------------------------------------
# Source 1: REST Countries — base rows
# ---------------------------------------------------------------------------

def fetch_rest_countries(use_cache: bool) -> list[dict[str, Any]]:
    raw = http_get(REST_COUNTRIES_URL, use_cache=use_cache)
    items = json.loads(raw)
    base: list[dict[str, Any]] = []
    for c in items:
        if not c.get("unMember"):
            continue
        cca2 = c.get("cca2")
        cca3 = c.get("cca3")
        name = (c.get("name") or {}).get("common")
        if not (cca2 and cca3 and name):
            continue
        capitals = c.get("capital") or []
        base.append({
            "name": name,
            "code": cca2,
            "cca3": cca3,
            "flag": c.get("flag"),
            "capital": capitals[0] if capitals else None,
            "continent": c.get("region"),
            "population": c.get("population"),
            "area_km2": c.get("area"),
        })
    base.sort(key=lambda r: r["name"])
    return base


# ---------------------------------------------------------------------------
# Source 2: World Bank — GDP per capita (current US$)
# ---------------------------------------------------------------------------

def fetch_worldbank_gdp(cca3_list: list[str], use_cache: bool) -> dict[str, float]:
    out: dict[str, float] = {}
    for cca3 in cca3_list:
        url = WORLDBANK_URL.format(cca3=cca3)
        try:
            raw = http_get(url, use_cache=use_cache, allow_404=True)
        except Exception as e:
            print(f"  ! GDP fetch failed for {cca3}: {e}", file=sys.stderr)
            continue
        if raw is None:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
            continue
        # Most-recent non-null value
        for row in payload[1]:
            v = row.get("value")
            if v is not None:
                out[cca3] = float(v)
                break
    return out


# ---------------------------------------------------------------------------
# Source 3: Passport Index — rank by visa-free count
# ---------------------------------------------------------------------------

_VISA_FREE_TOKENS = {"visa free", "visa on arrival", "e-visa", "covid-19 ban"}
# "covid-19 ban" was used historically for some rows — treat conservatively as
# *not* visa-free. Keep this set strict: visa free + VOA + e-visa, plus any
# integer cell (= number of visa-free days).


def _is_visa_free(cell: str) -> bool:
    s = (cell or "").strip().lower()
    if not s or s == "-1" or s == "-":
        return False
    if s in {"visa free", "visa on arrival", "e-visa"}:
        return True
    # Numeric → number of visa-free days granted
    try:
        return int(s) > 0
    except ValueError:
        return False


def fetch_passport_ranks(use_cache: bool) -> dict[str, int]:
    raw = http_get(PASSPORT_MATRIX_URL, use_cache=use_cache)
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {}
    header = rows[0]
    # First column is the holder country code; remaining columns are destinations.
    scores: dict[str, int] = {}
    for row in rows[1:]:
        if not row:
            continue
        holder = row[0].strip().upper()
        if not holder or len(holder) != 2:
            continue
        score = 0
        for i, cell in enumerate(row[1:], start=1):
            if i >= len(header):
                break
            dest = header[i].strip().upper()
            if dest == holder:
                continue  # don't count self
            if _is_visa_free(cell):
                score += 1
        scores[holder] = score

    # Dense rank: highest score = rank 1, ties share a rank.
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    ranks: dict[str, int] = {}
    last_score: int | None = None
    current_rank = 0
    for code, score in ranked:
        if score != last_score:
            current_rank += 1
            last_score = score
        ranks[code] = current_rank
    return ranks


# ---------------------------------------------------------------------------
# Source 4: factbook.json — coastline (km)
# ---------------------------------------------------------------------------

_COAST_NUM_RE = re.compile(r"([\d,]+(?:\.\d+)?)\s*km")


def _parse_coast_text(text: str) -> float | None:
    if not text:
        return None
    s = text.lower()
    if "landlocked" in s or "0 km" in s.replace(",", ""):
        return 0.0
    m = _COAST_NUM_RE.search(s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _factbook_slug(name: str) -> str:
    s = name.lower()
    s = s.replace("&", "and")
    s = re.sub(r"[(),.']", "", s)
    s = re.sub(r"[\s/]+", "-", s).strip("-")
    return s


def fetch_coastlines(rows: list[dict[str, Any]], use_cache: bool) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for r in rows:
        cca2 = r["code"]
        slug = _factbook_slug(r["name"])
        found_text: str | None = None
        for folder in FACTBOOK_CANDIDATE_DIRS:
            url = FACTBOOK_FILE_URL.format(folder=folder, slug=slug)
            try:
                raw = http_get(url, use_cache=use_cache, allow_404=True)
            except Exception:
                raw = None
            if raw is None:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            geo = payload.get("Geography") or {}
            coast = geo.get("Coastline") or {}
            txt = coast.get("text")
            if txt:
                found_text = txt
                break
        out[cca2] = _parse_coast_text(found_text) if found_text is not None else None
    return out


# ---------------------------------------------------------------------------
# Merge + write
# ---------------------------------------------------------------------------

def build_rows(
    base: list[dict[str, Any]],
    gdp_by_cca3: dict[str, float],
    rank_by_cca2: dict[str, int],
    coast_by_cca2: dict[str, float | None],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for b in base:
        cca2 = b["code"]
        cca3 = b["cca3"]
        gdp = gdp_by_cca3.get(cca3)
        rows.append({
            "name": b["name"],
            "code": cca2,
            "flag": b.get("flag"),
            "capital": b.get("capital"),
            "continent": b.get("continent"),
            "population": b.get("population"),
            "area_km2": b.get("area_km2"),
            "coastline_km": coast_by_cca2.get(cca2),
            "gdp_per_capita_usd": round(gdp, 2) if gdp is not None else None,
            "passport_rank": rank_by_cca2.get(cca2),
        })
    rows.sort(key=lambda r: r["name"])
    return rows


def coverage_report(rows: list[dict[str, Any]]) -> None:
    fields = [
        "capital", "continent", "population", "area_km2",
        "coastline_km", "gdp_per_capita_usd", "passport_rank",
    ]
    total = len(rows)
    print(f"\nUN members: {total}")
    width = max(len(f) for f in fields)
    for f in fields:
        n = sum(1 for r in rows if r.get(f) is not None)
        print(f"  {f.ljust(width)}  {n}/{total}")


def write_json(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Rebuild data/countries.json from public sources.")
    p.add_argument("--no-cache", action="store_true", help="ignore the on-disk HTTP cache")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output JSON path")
    args = p.parse_args(argv)
    use_cache = not args.no_cache

    print("→ REST Countries (UN members)…")
    base = fetch_rest_countries(use_cache)
    print(f"  got {len(base)} rows")

    print("→ World Bank GDP per capita…")
    gdp = fetch_worldbank_gdp([r["cca3"] for r in base], use_cache)
    print(f"  got {len(gdp)} GDP values")

    print("→ Passport Index ranks…")
    ranks = fetch_passport_ranks(use_cache)
    print(f"  got {len(ranks)} passport ranks")

    print("→ CIA Factbook coastlines…")
    coast = fetch_coastlines(base, use_cache)
    populated = sum(1 for v in coast.values() if v is not None)
    print(f"  got {populated} coastline values (of {len(coast)} attempted)")

    rows = build_rows(base, gdp, ranks, coast)
    coverage_report(rows)

    write_json(rows, args.out)
    print(f"\nWrote {args.out.relative_to(REPO_ROOT) if args.out.is_absolute() and REPO_ROOT in args.out.parents else args.out} ({len(rows)} countries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
