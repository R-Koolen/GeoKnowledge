(() => {
  // ── Stat pool ──────────────────────────────────────────────────────────
  // invert: true  → lower raw value = globally better (e.g. passport rank 1 = strongest)
  const STAT_POOL = [
    { key: "population",              label: "👥 Population" },
    { key: "area_km2",                label: "🗺️ Area" },
    { key: "gdp_per_capita_usd",      label: "💵 GDP per Capita" },
    { key: "passport_rank",           label: "🛂 Passport Power",       invert: true },
    { key: "coastline_km",            label: "🌊 Coastline" },
    { key: "life_expectancy_years",   label: "❤️ Life Expectancy" },
    { key: "median_age_years",        label: "🎂 Median Age" },
    { key: "obesity_pct",             label: "🍔 Obesity Rate" },
    { key: "highest_point_m",         label: "⛰️ Highest Point" },
    { key: "lowest_point_m",          label: "🕳️ Lowest Point" },
    { key: "internet_users_pct",      label: "🌐 Internet Users" },
    { key: "unemployment_pct",        label: "💼 Unemployment" },
    { key: "urban_population_pct",    label: "🏙️ Urbanisation" },
    { key: "birth_rate_per_1000",     label: "👶 Birth Rate" },
    { key: "population_growth_pct",   label: "📈 Population Growth" },
    { key: "mobile_per_100",          label: "📱 Mobile Phones" },
    { key: "land_forest_pct",         label: "🌲 Forest Cover" },
    { key: "land_agricultural_pct",   label: "🌾 Agricultural Land" },
    { key: "tobacco_use_pct",         label: "🚬 Tobacco Use" },
    { key: "alcohol_l_per_year",      label: "🍺 Alcohol Consumption" },
    { key: "married_women_pct",       label: "💍 Married Women" },
    { key: "gdp_sector_services_pct", label: "🏦 Services GDP Share" },
    { key: "gdp_sector_agriculture_pct", label: "🌿 Agriculture GDP" },
  ];

  const ROUND_SIZE = 8;

  const els = {
    startScreen:  document.getElementById("start-screen"),
    startBtn:     document.getElementById("start-btn"),
    loading:      document.getElementById("loading"),
    board:        document.getElementById("board"),
    countryGrid:  document.getElementById("country-grid"),
    statList:     document.getElementById("stat-list"),
    submitBtn:    document.getElementById("submit-btn"),
    resetBtn:     document.getElementById("reset-btn"),
    endScreen:    document.getElementById("end-screen"),
    endTitle:     document.getElementById("end-title"),
    endScore:     document.getElementById("end-score"),
    resultBody:   document.getElementById("result-body"),
    resultFoot:   document.getElementById("result-foot"),
    playAgain:    document.getElementById("play-again"),
  };

  const state = {
    allCountries: [],
    stats: [],
    countries: [],
    globalRanks: {},      // {statKey: {countryCode: rank}}
    assignment: {},       // {statKey: countryCode}
    selectedCountry: null,
    optimalAssignment: {},
    optimalScore: 0,
    maxScore: 0,
  };

  // ── Utilities ──────────────────────────────────────────────────────────

  function flagSrc(code)    { return `https://flagcdn.com/w160/${code.toLowerCase()}.png`; }
  function flagSrcSet(code) { return `https://flagcdn.com/w320/${code.toLowerCase()}.png 2x`; }

  function sample(arr, n) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  // ── Global rank computation ────────────────────────────────────────────

  function computeGlobalRanks(stats) {
    const ranks = {};
    for (const stat of stats) {
      const { key, invert } = stat;
      const sorted = state.allCountries
        .filter(c => c[key] != null)
        .sort((a, b) => invert ? a[key] - b[key] : b[key] - a[key]);
      ranks[key] = {};
      sorted.forEach((c, i) => { ranks[key][c.code] = i + 1; });
    }
    return ranks;
  }

  // ── Brute-force optimal (8! = 40 320 iterations) ──────────────────────

  function* permutations(arr) {
    if (arr.length <= 1) { yield arr; return; }
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permutations(rest)) {
        yield [arr[i], ...perm];
      }
    }
  }

  function scorePermutation(perm) {
    let total = 0;
    for (let i = 0; i < ROUND_SIZE; i++) {
      total += state.globalRanks[state.stats[i].key][state.countries[perm[i]].code];
    }
    return total;
  }

  function findOptimal() {
    let minScore = Infinity;
    let maxScore = -Infinity;
    let bestPerm = null;
    const indices = Array.from({ length: ROUND_SIZE }, (_, i) => i);
    for (const perm of permutations(indices)) {
      const s = scorePermutation(perm);
      if (s < minScore) { minScore = s; bestPerm = [...perm]; }
      if (s > maxScore)   maxScore = s;
    }
    const assignment = {};
    for (let i = 0; i < ROUND_SIZE; i++) {
      assignment[state.stats[i].key] = state.countries[bestPerm[i]].code;
    }
    return { assignment, minScore, maxScore };
  }

  // ── Round setup ────────────────────────────────────────────────────────

  function setupRound() {
    // Pick 8 stats
    state.stats = sample(STAT_POOL, ROUND_SIZE);

    // Pick countries that have all 8 stats non-null
    const eligible = state.allCountries.filter(c =>
      state.stats.every(s => c[s.key] != null)
    );
    if (eligible.length < ROUND_SIZE) {
      // Fallback: relax to requiring only 6 of 8 stats (fill missing with null-rank fallback)
      state.countries = sample(
        state.allCountries.filter(c => state.stats.filter(s => c[s.key] != null).length >= 6),
        ROUND_SIZE
      );
    } else {
      state.countries = sample(eligible, ROUND_SIZE);
    }

    state.globalRanks = computeGlobalRanks(state.stats);

    // Ensure all chosen countries have a rank entry (fill missing with a high fallback rank)
    const totalCountries = state.allCountries.length;
    for (const stat of state.stats) {
      for (const c of state.countries) {
        if (!(c.code in state.globalRanks[stat.key])) {
          state.globalRanks[stat.key][c.code] = totalCountries + 1;
        }
      }
    }

    const { assignment, minScore, maxScore } = findOptimal();
    state.optimalAssignment = assignment;
    state.optimalScore = minScore;
    state.maxScore = maxScore;

    state.assignment = {};
    state.selectedCountry = null;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  function renderBoard() {
    renderCountryGrid();
    renderStatList();
    updateSubmit();
  }

  function renderCountryGrid() {
    els.countryGrid.innerHTML = "";
    for (const c of state.countries) {
      const li = document.createElement("li");
      li.className = "country-card";
      li.dataset.code = c.code;
      const assignedStat = Object.entries(state.assignment).find(([, code]) => code === c.code);
      if (assignedStat) li.classList.add("country-card--assigned");
      if (state.selectedCountry === c.code) li.classList.add("country-card--selected");
      li.innerHTML = `
        <img class="flag" src="${flagSrc(c.code)}" srcset="${flagSrcSet(c.code)}" alt="Flag of ${c.name}" loading="lazy" />
        <span class="country-card__name">${c.name}</span>
        ${assignedStat ? `<span class="country-card__tag">${state.stats.find(s => s.key === assignedStat[0])?.label.replace(/^\S+\s/, "")}</span>` : ""}
      `;
      li.addEventListener("click", () => onCountryClick(c.code));
      els.countryGrid.appendChild(li);
    }
  }

  function renderStatList() {
    els.statList.innerHTML = "";
    for (const stat of state.stats) {
      const li = document.createElement("li");
      li.className = "stat-row";
      if (state.selectedCountry) li.classList.add("stat-row--highlighted");
      li.dataset.key = stat.key;

      const assignedCode = state.assignment[stat.key];
      const assignedCountry = assignedCode ? state.countries.find(c => c.code === assignedCode) : null;

      li.innerHTML = `
        <span class="stat-row__label">${stat.label}</span>
        <span class="stat-slot" id="slot-${stat.key}">
          ${assignedCountry
            ? `<img class="stat-slot__flag" src="${flagSrc(assignedCountry.code)}" alt="" />
               <span class="stat-slot__name">${assignedCountry.name}</span>
               <button class="stat-slot__remove" data-key="${stat.key}" aria-label="Remove ${assignedCountry.name}">×</button>`
            : `<span style="opacity:0.45;font-size:0.75rem">— pick one —</span>`}
        </span>
      `;

      li.addEventListener("click", (e) => {
        if (e.target.closest(".stat-slot__remove")) return;
        onStatClick(stat.key);
      });
      li.querySelector(".stat-slot__remove")?.addEventListener("click", (e) => {
        e.stopPropagation();
        unassignStat(stat.key);
      });

      els.statList.appendChild(li);
    }
  }

  function updateSubmit() {
    const filled = Object.keys(state.assignment).length;
    els.submitBtn.disabled = filled < ROUND_SIZE;
  }

  // ── Interaction ────────────────────────────────────────────────────────

  function onCountryClick(code) {
    const isAssigned = Object.values(state.assignment).includes(code);
    if (isAssigned) return; // assigned countries can't be re-selected directly
    state.selectedCountry = (state.selectedCountry === code) ? null : code;
    renderBoard();
  }

  function onStatClick(statKey) {
    if (!state.selectedCountry) return;

    const newCode = state.selectedCountry;

    // If another country was already in this slot, free it
    const displaced = state.assignment[statKey];
    if (displaced) {
      // Just overwrite — displaced country returns to the pool automatically
    }

    // If the newly selected country was in another slot, free that slot
    const prevStat = Object.entries(state.assignment).find(([, c]) => c === newCode)?.[0];
    if (prevStat) delete state.assignment[prevStat];

    state.assignment[statKey] = newCode;
    state.selectedCountry = null;
    renderBoard();
  }

  function unassignStat(statKey) {
    delete state.assignment[statKey];
    renderBoard();
  }

  function resetRound() {
    state.assignment = {};
    state.selectedCountry = null;
    renderBoard();
  }

  // ── Submit & end screen ────────────────────────────────────────────────

  function getUserScore() {
    return state.stats.reduce((sum, stat) => {
      const code = state.assignment[stat.key];
      return sum + (code ? state.globalRanks[stat.key][code] : 0);
    }, 0);
  }

  function submit() {
    const userScore = getUserScore();
    const opt = state.optimalScore;
    const max = state.maxScore;
    const efficiency = max === opt ? 100
      : Math.round((max - userScore) / (max - opt) * 100);

    els.board.classList.add("hidden");

    // Title
    els.endTitle.classList.remove("win", "lose");
    if (efficiency >= 80) {
      els.endTitle.textContent = "🏆 Excellent!";
      els.endTitle.classList.add("win");
    } else if (efficiency < 40) {
      els.endTitle.textContent = "📉 Rough round";
      els.endTitle.classList.add("lose");
    } else {
      els.endTitle.textContent = "📊 Not bad";
    }

    els.endScore.textContent =
      `Your score: ${userScore} · Optimal: ${opt} · Efficiency: ${efficiency}%`;

    // Comparison table
    els.resultBody.innerHTML = "";
    for (const stat of state.stats) {
      const userCode = state.assignment[stat.key];
      const optCode  = state.optimalAssignment[stat.key];
      const userCountry = state.countries.find(c => c.code === userCode);
      const optCountry  = state.countries.find(c => c.code === optCode);
      const userRank = state.globalRanks[stat.key][userCode] || "—";
      const optRank  = state.globalRanks[stat.key][optCode]  || "—";
      const rankDelta = typeof userRank === "number" && typeof optRank === "number"
        ? userRank - optRank : null;
      const rankClass = rankDelta === null ? "" :
        rankDelta === 0 ? "rt-rank--match" :
        rankDelta <= 5  ? "rt-rank--close" : "rt-rank--miss";

      els.resultBody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>${stat.label}</td>
          <td class="rt-your rt-country">
            ${userCountry ? `<span class="rt-pick"><img class="rt-flag" src="${flagSrc(userCountry.code)}" alt="" /><span>${userCountry.name}</span></span>` : "—"}
          </td>
          <td class="rt-your rt-rank ${rankClass}">#${userRank}</td>
          <td class="rt-opt rt-country">
            ${optCountry ? `<span class="rt-pick"><img class="rt-flag" src="${flagSrc(optCountry.code)}" alt="" /><span>${optCountry.name}</span></span>` : "—"}
          </td>
          <td class="rt-opt rt-rank">#${optRank}</td>
        </tr>
      `);
    }

    els.resultFoot.innerHTML = `
      <tr>
        <td colspan="2"><strong>Total</strong></td>
        <td><strong>#${userScore}</strong></td>
        <td></td>
        <td><strong>#${opt}</strong></td>
      </tr>
    `;

    els.endScreen.classList.remove("hidden");
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function startGame() {
    setupRound();
    els.startScreen.classList.add("hidden");
    els.endScreen.classList.add("hidden");
    els.board.classList.remove("hidden");
    renderBoard();
  }

  function playAgain() {
    els.endScreen.classList.add("hidden");
    startGame();
  }

  async function init() {
    try {
      const res = await fetch("../data/countries.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.allCountries = await res.json();
    } catch (err) {
      els.loading.textContent =
        "Could not load countries.json — serve over http://, not file:// (" + err.message + ")";
      els.startBtn.disabled = true;
      return;
    }
    if (state.allCountries.length < ROUND_SIZE) {
      els.loading.textContent = "Not enough countries in the dataset.";
      els.startBtn.disabled = true;
      return;
    }

    els.loading.classList.add("hidden");
    els.startBtn.addEventListener("click", startGame);
    els.submitBtn.addEventListener("click", submit);
    els.resetBtn.addEventListener("click", resetRound);
    els.playAgain.addEventListener("click", playAgain);
  }

  init();
})();
