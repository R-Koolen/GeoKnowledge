# Factbook field reference

Every cached `data/raw/factbook/<cca>.json` file follows the same shape (sampled from `nl.json`). Each top-level key below is a category; bullets are fields; sub-bullets are the inner sub-fields. Most leaves are `{ "text": "..." }`; a few are nested year-keyed dicts for time series.

Use this as a menu when adding new stats — pick a path, write a `_text(fb, *path)` extractor, and register it in `FACTBOOK_STATS` in [build_countries.py](build_countries.py).

## Introduction
- Background → text

## Geography
- Location → text
- Geographic coordinates → text
- Map references → text
- Area → total · land · water
- Area - comparative → text
- Land boundaries → total · border countries
- Coastline → text
- Maritime claims → territorial sea · contiguous zone · exclusive fishing zone
- Climate → text
- Terrain → text
- Elevation → highest point · lowest point · mean elevation
- Natural resources → text
- Land use → agricultural land · arable land · permanent crops · permanent pasture · forest · other
- Irrigated land → text
- Major rivers (by length in km) → text
- Major watersheds (area sq km) → Atlantic Ocean drainage
- Population distribution → text
- Natural hazards → text
- Geography - note → text

## People and Society
- Population → total · male · female
- Nationality → noun · adjective
- Ethnic groups → text
- Languages → Languages · major-language sample(s)
- Religions → text
- Age structure → 0-14 years · 15-64 years · 65 years and over
- Dependency ratios → total · youth · elderly · potential support
- Median age → total · male · female
- Population growth rate → text
- Birth rate → text
- Death rate → text
- Net migration rate → text
- Population distribution → text
- Urbanization → urban population · rate of urbanization
- Major urban areas - population → text
- Sex ratio → at birth · 0-14 · 15-64 · 65+ · total population
- Mother's mean age at first birth → text
- Maternal mortality ratio → text
- Infant mortality rate → total · male · female
- Life expectancy at birth → total population · male · female
- Total fertility rate → text
- Gross reproduction rate → text
- Drinking water source → improved (urban / rural / total) · unimproved (urban / rural / total)
- Health expenditure → % of GDP · % of national budget
- Physician density → text
- Hospital bed density → text
- Sanitation facility access → improved (urban / rural / total) · unimproved (urban / rural / total)
- Obesity - adult prevalence rate → text
- Alcohol consumption per capita → total · beer · wine · spirits · other alcohols
- Tobacco use → total · male · female
- Currently married women (ages 15-49) → text
- Education expenditure → % GDP · % national budget
- School life expectancy (primary to tertiary education) → total · male · female

## Environment
- Environmental issues → text
- International environmental agreements → party to · signed but not ratified
- Climate → text
- Land use → (same shape as Geography)
- Urbanization → urban population · rate of urbanization
- Carbon dioxide emissions → total · from coal · from petroleum · from natural gas
- Particulate matter emissions → text
- Methane emissions → energy · agriculture · waste · other
- Waste and recycling → solid waste generated annually · % recycled
- Total water withdrawal → municipal · industrial · agricultural
- Total renewable water resources → text
- Geoparks → total global geoparks · global geoparks and regional networks

## Government
- Country name → conventional long form · conventional short form · local long form · local short form · abbreviation · etymology
- Government type → text
- Capital → name · geographic coordinates · time difference · daylight saving time · time zone note · etymology
- Administrative divisions → text
- Legal system → text
- Constitution → history · amendment process
- International law organization participation → text
- Citizenship → by birth · by descent only · dual recognized · residency requirement
- Suffrage → text
- Executive branch → chief of state · head of government · cabinet · election/appointment process
- Legislative branch → legislature name · legislative structure
- Legislative branch - lower chamber → chamber name · seats · electoral system · scope · term · most recent election · parties+seats · % women · next election
- Legislative branch - upper chamber → (similar fields, no electoral system)
- Judicial branch → highest court(s) · selection and term · subordinate courts
- Political parties → text
- Diplomatic representation in the US → chief · chancery · phone · FAX · email/website · consulates
- Diplomatic representation from the US → chief · embassy · mailing address · phone · FAX · email/website · consulates
- International organization participation → text
- Independence → text
- National holiday → text
- Flag → text
- National symbol(s) → text
- National color(s) → text
- National anthem(s) → title · lyrics/music · history
- National heritage → total World Heritage Sites · selected locales

## Economy
*Many fields are year-keyed: e.g. `Real GDP per capita 2024`, `... 2023`, `... 2022`. Use `_latest_year_text(node, "Real GDP per capita ")` to grab the latest year.*

- Economic overview → text
- Real GDP (purchasing power parity) → 2024 / 2023 / 2022
- Real GDP growth rate → 2024 / 2023 / 2022
- Real GDP per capita → 2024 / 2023 / 2022
- GDP (official exchange rate) → text
- Inflation rate (consumer prices) → 2024 / 2023 / 2022
- GDP - composition, by sector of origin → agriculture · industry · services
- GDP - composition, by end use → household · government · fixed capital · inventories · exports · imports
- Agricultural products → text
- Industries → text
- Industrial production growth rate → text
- Labor force → text
- Unemployment rate → 2024 / 2023 / 2022
- Youth unemployment rate (ages 15-24) → total · male · female
- Population below poverty line → text
- Gini Index coefficient - distribution of family income → year-keyed
- Average household expenditures → on food · on alcohol and tobacco
- Household income or consumption by percentage share → lowest 10% · highest 10%
- Remittances → 2024 / 2023 / 2022
- Budget → revenues · expenditures
- Public debt → year-keyed
- Taxes and other revenues → text
- Current account balance → 2024 / 2023 / 2022
- Exports → 2024 / 2023 / 2022
- Exports - partners → text
- Exports - commodities → text
- Imports → 2024 / 2023 / 2022
- Imports - partners → text
- Imports - commodities → text
- Reserves of foreign exchange and gold → 2024 / 2023 / 2022
- Exchange rates → Currency · 2024 / 2023 / 2022 / 2021 / 2020

## Energy
- Electricity access → electrification - total population
- Electricity → installed generating capacity · consumption · exports · imports · transmission/distribution losses
- Electricity generation sources → fossil fuels · nuclear · solar · wind · hydroelectricity · biomass and waste
- Nuclear energy → operational reactors · net capacity · % of total electricity · permanently shut down
- Coal → production · consumption · exports · imports · proven reserves
- Petroleum → total production · refined consumption · crude oil estimated reserves
- Natural gas → production · consumption · exports · imports · proven reserves
- Energy consumption per capita → year-keyed (e.g. 2023)

## Communications
- Telephones - fixed lines → total subscriptions · per 100 inhabitants
- Telephones - mobile cellular → total subscriptions · per 100 inhabitants
- Broadcast media → text
- Internet country code → text
- Internet users → percent of population
- Broadband - fixed subscriptions → total · per 100 inhabitants

## Transportation
- Civil aircraft registration country code prefix → text
- Airports → text
- Heliports → text
- Railways → total
- Merchant marine → total · by type
- Ports → total · large · medium · small · very small · with oil terminals · key ports

## Military and Security
- Military and security forces → text
- Military expenditures → 2025 / 2024 / 2023 / 2022 / 2021
- Military and security service personnel strengths → text
- Military equipment inventories and acquisitions → text
- Military service age and obligation → text
- Military deployments → text
- Military - note → text

## Space
- Space agency/agencies → text
- Space program overview → text
- Key space-program milestones → text

## Terrorism
- Terrorist group(s) → text

## Transnational Issues
- Refugees and internally displaced persons → refugees · stateless persons
- Illicit drugs → USG identification

---

## Patterns when writing extractors

- Most leaves are `{ "text": "<value with unit and (year est.) suffix>" }`. `_text(fb, "Geography", "Coastline")` handles both `{"text": ...}` and bare strings.
- **Year-keyed series** (most of Economy + Military expenditures + a couple of others) use keys like `"Unemployment rate 2024"`. Use `_latest_year_text(node, "Unemployment rate ")` — it sorts the keys descending and grabs the most recent.
- Coverage varies per country: not every country has `Nuclear energy`, `Geoparks` is rare, and `Maritime claims` doesn't exist for landlocked countries. The helpers (`_text`, `_walk`) already return `None` when the path is missing.

## Already wired up

These factbook fields are already extracted and exposed in `countries.json` (see `FACTBOOK_STATS` in [build_countries.py](build_countries.py)):

- `coastline_km` — Geography → Coastline
- `life_expectancy_years` — People and Society → Life expectancy at birth → total population
- `median_age_years` — People and Society → Median age → total
- `population_growth_pct` — People and Society → Population growth rate
- `obesity_pct` — People and Society → Obesity - adult prevalence rate
- `alcohol_l_per_year` — People and Society → Alcohol consumption per capita
- `unemployment_pct` — Economy → Unemployment rate (most recent year)
- `highest_point_m` — Geography → Elevation → highest point
- `internet_users_pct` — Communications → Internet users → percent of population
