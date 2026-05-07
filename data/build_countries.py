"""Build data/countries.json from public sources.

Network sources are cached under data/raw/ and only re-fetched if their
files are deleted. Stats derived from the factbook cache are computed
fresh on every run — no per-stat shard files.

    python data/build_countries.py

Refresh a fetched source:   rm data/raw/<file> && rerun
Refresh one country's factbook entry:  rm data/raw/factbook/<cia>.json && rerun
Refresh everything:         rm -r data/raw && rerun

Add a new factbook stat:
    1. Write a tiny extract_*(fb) function below.
    2. Register it in FACTBOOK_STATS.
    3. (Optional) wire it into higher-lower/ — STAT_META + <option>.
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


# --- network sources (each has a single shard under data/raw/) --------------

def fetch_base() -> list[dict[str, Any]]:
    """REST Countries — UN members."""
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


# --- factbook: cache one file per country, then extract many stats ----------

# factbook.json uses CIA Factbook (GEC / FIPS 10-4) two-letter codes for
# filenames, NOT ISO 3166-1 alpha-2. e.g. Algeria is `ag` (not `dz`),
# Australia is `as` (not `au`). Source: factbook.json README + the index
# page on cia.gov.
ISO2_TO_CIA: dict[str, str] = {
    "AF": "af", "AL": "al", "DZ": "ag", "AD": "an", "AO": "ao", "AG": "ac",
    "AR": "ar", "AM": "am", "AU": "as", "AT": "au", "AZ": "aj",
    "BS": "bf", "BH": "ba", "BD": "bg", "BB": "bb", "BY": "bo", "BE": "be",
    "BZ": "bh", "BJ": "bn", "BT": "bt", "BO": "bl", "BA": "bk", "BW": "bc",
    "BR": "br", "BN": "bx", "BG": "bu", "BF": "uv", "MM": "bm", "BI": "by",
    "KH": "cb", "CM": "cm", "CA": "ca", "CV": "cv", "CF": "ct", "TD": "cd",
    "CL": "ci", "CN": "ch", "CO": "co", "KM": "cn", "CD": "cg", "CG": "cf",
    "CR": "cs", "CI": "iv", "HR": "hr", "CU": "cu", "CY": "cy", "CZ": "ez",
    "DK": "da", "DJ": "dj", "DM": "do", "DO": "dr",
    "EC": "ec", "EG": "eg", "SV": "es", "GQ": "ek", "ER": "er", "EE": "en",
    "SZ": "wz", "ET": "et",
    "FJ": "fj", "FI": "fi", "FR": "fr",
    "GA": "gb", "GM": "ga", "GE": "gg", "DE": "gm", "GH": "gh", "GR": "gr",
    "GD": "gj", "GT": "gt", "GN": "gv", "GW": "pu", "GY": "gy",
    "HT": "ha", "HN": "ho", "HU": "hu",
    "IS": "ic", "IN": "in", "ID": "id", "IR": "ir", "IQ": "iz", "IE": "ei",
    "IL": "is", "IT": "it",
    "JM": "jm", "JP": "ja", "JO": "jo",
    "KZ": "kz", "KE": "ke", "KI": "kr", "KP": "kn", "KR": "ks", "KW": "ku",
    "KG": "kg",
    "LA": "la", "LV": "lg", "LB": "le", "LS": "lt", "LR": "li", "LY": "ly",
    "LI": "ls", "LT": "lh", "LU": "lu",
    "MG": "ma", "MW": "mi", "MY": "my", "MV": "mv", "ML": "ml", "MT": "mt",
    "MH": "rm", "MR": "mr", "MU": "mp", "MX": "mx", "FM": "fm", "MD": "md",
    "MC": "mn", "MN": "mg", "ME": "mj", "MA": "mo", "MZ": "mz",
    "NA": "wa", "NR": "nr", "NP": "np", "NL": "nl", "NZ": "nz", "NI": "nu",
    "NE": "ng", "NG": "ni", "NO": "no", "MK": "mk",
    "OM": "mu",
    "PK": "pk", "PW": "ps", "PA": "pm", "PG": "pp", "PY": "pa", "PE": "pe",
    "PH": "rp", "PL": "pl", "PT": "po",
    "QA": "qa",
    "RO": "ro", "RU": "rs", "RW": "rw",
    "KN": "sc", "LC": "st", "VC": "vc", "WS": "ws", "SM": "sm", "ST": "tp",
    "SA": "sa", "SN": "sg", "RS": "ri", "SC": "se", "SL": "sl", "SG": "sn",
    "SK": "lo", "SI": "si", "SB": "bp", "SO": "so", "ZA": "sf", "SS": "od",
    "ES": "sp", "LK": "ce", "SD": "su", "SR": "ns", "SE": "sw", "CH": "sz",
    "SY": "sy",
    "TJ": "ti", "TZ": "tz", "TH": "th", "TL": "tt", "TG": "to", "TO": "tn",
    "TT": "td", "TN": "ts", "TR": "tu", "TM": "tx", "TV": "tv",
    "UG": "ug", "UA": "up", "AE": "ae", "GB": "uk", "US": "us", "UY": "uy",
    "UZ": "uz",
    "VU": "nh", "VE": "ve", "VN": "vm",
    "YE": "ym",
    "ZM": "za", "ZW": "zi",
}

_FACTBOOK_FOLDERS = [
    "africa", "europe", "east-n-southeast-asia", "south-america",
    "central-america-n-caribbean", "middle-east", "north-america",
    "south-asia", "central-asia", "australia-oceania",
]


def fetch_factbook_files(base: list[dict[str, Any]]) -> None:
    """Cache each country's factbook JSON under raw/factbook/<cia>.json."""
    fb_dir = RAW / "factbook"
    fb_dir.mkdir(parents=True, exist_ok=True)

    todo = []
    for r in base:
        cia = ISO2_TO_CIA.get(r["code"])
        if not cia:
            continue  # No factbook code mapping for this country
        path = fb_dir / f"{cia}.json"
        if not path.exists():
            todo.append((cia, path, r["name"]))

    if not todo:
        return
    print(f"fetching factbook/ ({len(todo)} files)…")
    for cia, path, name in todo:
        for folder in _FACTBOOK_FOLDERS:
            url = (f"https://raw.githubusercontent.com/factbook/factbook.json/"
                   f"master/{folder}/{cia}.json")
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                path.write_text(resp.text, encoding="utf-8")
                break
        else:
            # No folder matched. Mark with empty marker so we don't retry.
            print(f"  ! no factbook entry found for {name} ({cia})")
            path.write_text("{}", encoding="utf-8")


def load_factbook_files(base: list[dict[str, Any]]) -> dict[str, dict]:
    """Ensure files are cached, then return {ISO2: parsed_factbook_json}."""
    fetch_factbook_files(base)
    out: dict[str, dict] = {}
    for r in base:
        cia = ISO2_TO_CIA.get(r["code"])
        if not cia:
            out[r["code"]] = {}
            continue
        path = RAW / "factbook" / f"{cia}.json"
        try:
            out[r["code"]] = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            out[r["code"]] = {}
    return out


# --- factbook helpers ------------------------------------------------------

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
    """For dicts with keys 'Foo 2024', 'Foo 2023', ... pick the latest year."""
    if not isinstance(node, dict):
        return None
    yearly = [(k, v) for k, v in node.items() if k.startswith(prefix)]
    if yearly:
        yearly.sort(reverse=True)
        v = yearly[0][1]
        return v.get("text") if isinstance(v, dict) else (v if isinstance(v, str) else None)
    v = node.get("text")
    return v if isinstance(v, str) else None


# --- per-stat extractors ---------------------------------------------------

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

# Geography
def extract_lowest_point(fb: dict) -> float | None:
    return _first_number(_text(fb, "Geography", "Elevation", "lowest point"))

def extract_land_agricultural(fb: dict) -> float | None:
    return _first_number(_text(fb, "Geography", "Land use", "agricultural land"))

def extract_land_forest(fb: dict) -> float | None:
    return _first_number(_text(fb, "Geography", "Land use", "forest"))

# Age structure
def extract_age_0_14(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Age structure", "0-14 years"))

def extract_age_15_64(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Age structure", "15-64 years"))

def extract_age_65_plus(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Age structure", "65 years and over"))

# People
def extract_birth_rate(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Birth rate"))

def extract_urban_population(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Urbanization", "urban population"))

def extract_tobacco(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society", "Tobacco use", "total"))

def extract_married_women(fb: dict) -> float | None:
    return _first_number(_text(fb, "People and Society",
                                   "Currently married women (ages 15-49)"))

# Economy — GDP composition
def extract_gdp_agriculture(fb: dict) -> float | None:
    return _first_number(_text(fb, "Economy",
                                   "GDP - composition, by sector of origin", "agriculture"))

def extract_gdp_industry(fb: dict) -> float | None:
    return _first_number(_text(fb, "Economy",
                                   "GDP - composition, by sector of origin", "industry"))

def extract_gdp_services(fb: dict) -> float | None:
    return _first_number(_text(fb, "Economy",
                                   "GDP - composition, by sector of origin", "services"))

# Household expenditures
def extract_hh_food(fb: dict) -> float | None:
    return _first_number(_text(fb, "Economy", "Average household expenditures", "on food"))

def extract_hh_alcohol_tobacco(fb: dict) -> float | None:
    return _first_number(_text(fb, "Economy", "Average household expenditures",
                                   "on alcohol and tobacco"))

# Exports — values like "$671.8 billion (2024 est.)" or "$1.2 trillion"
_USD_RE = re.compile(r"\$?\s*([\d,.]+)\s*(trillion|billion|million)", re.IGNORECASE)

def extract_exports(fb: dict) -> float | None:
    node = _walk(fb, "Economy", "Exports")
    text = _latest_year_text(node, "Exports ")
    if not text:
        return None
    m = _USD_RE.search(text)
    if not m:
        return None
    num = float(m.group(1).replace(",", ""))
    unit = m.group(2).lower()
    if unit == "trillion": return round(num * 1e12)
    if unit == "billion":  return round(num * 1e9)
    return round(num * 1e6)

# Mobile
def extract_mobile_per_100(fb: dict) -> float | None:
    return _first_number(_text(fb, "Communications", "Telephones - mobile cellular",
                                   "subscriptions per 100 inhabitants"))


# Registry: (output_field_name, extractor). Add a tuple here to add a stat.
FACTBOOK_STATS: list[tuple[str, Callable[[dict], Any]]] = [
    # Geography
    ("coastline_km",                   extract_coastline),
    ("lowest_point_m",                 extract_lowest_point),
    ("land_agricultural_pct",          extract_land_agricultural),
    ("land_forest_pct",                extract_land_forest),
    ("highest_point_m",                extract_highest_point),
    # People and Society
    ("life_expectancy_years",          extract_life_expectancy),
    ("median_age_years",               extract_median_age),
    ("population_growth_pct",          extract_population_growth),
    ("birth_rate_per_1000",            extract_birth_rate),
    ("age_0_14_pct",                   extract_age_0_14),
    ("age_15_64_pct",                  extract_age_15_64),
    ("age_65_plus_pct",                extract_age_65_plus),
    ("urban_population_pct",           extract_urban_population),
    ("obesity_pct",                    extract_obesity),
    ("alcohol_l_per_year",             extract_alcohol),
    ("tobacco_use_pct",                extract_tobacco),
    ("married_women_pct",              extract_married_women),
    # Economy
    ("unemployment_pct",               extract_unemployment),
    ("gdp_sector_agriculture_pct",     extract_gdp_agriculture),
    ("gdp_sector_industry_pct",        extract_gdp_industry),
    ("gdp_sector_services_pct",        extract_gdp_services),
    ("household_expenditure_food_pct", extract_hh_food),
    ("household_expenditure_alcohol_tobacco_pct", extract_hh_alcohol_tobacco),
    ("exports_usd",                    extract_exports),
    # Communications
    ("internet_users_pct",             extract_internet_users),
    ("mobile_per_100",                 extract_mobile_per_100),
]


# --- merge -----------------------------------------------------------------

# Internal join keys that shouldn't appear in the public output.
BASE_INTERNAL_KEYS = {"cca3"}


def main() -> None:
    base = load_or_build(RAW / "base.json", fetch_base)
    gdp  = load_or_build(RAW / "gdp.json",      lambda: fetch_gdp([r["cca3"] for r in base]))
    pp   = load_or_build(RAW / "passport.json", fetch_passport)
    fb_files = load_factbook_files(base)

    # Convert borders (CCA3 from REST Countries) to CCA2 to match `code`.
    # Codes that don't resolve (e.g. UNK / Kosovo, non-UN members) are dropped.
    cca3_to_cca2 = {b["cca3"]: b["code"] for b in base}

    rows = []
    for b in base:
        row = {k: v for k, v in b.items() if k not in BASE_INTERNAL_KEYS}
        row["borders"] = [cca3_to_cca2[c] for c in (b.get("borders") or []) if c in cca3_to_cca2]
        row["gdp_per_capita_usd"] = gdp.get(b["cca3"])
        row["passport_rank"]      = pp.get(b["code"])
        fb = fb_files.get(b["code"], {})
        for field, extractor in FACTBOOK_STATS:
            row[field] = extractor(fb)
        # Trust REST Countries' landlocked flag over factbook parsing.
        if b.get("landlocked"):
            row["coastline_km"] = 0.0
        rows.append(row)
    rows.sort(key=lambda r: r["name"])

    OUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name} ({len(rows)} countries)")


if __name__ == "__main__":
    main()
