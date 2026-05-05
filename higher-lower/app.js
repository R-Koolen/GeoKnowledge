(() => {
  const STAT_META = {
    passport_rank:      { label: "🛂 Passport Power", unit: "rank",    invert: true  },
    gdp_per_capita_usd: { label: "💵 GDP per Capita", unit: "usd",     invert: false },
    coastline_km:       { label: "🌊 Coastline",      unit: "km",      invert: false },
    population:         { label: "👥 Population",     unit: "compact", invert: false },
    area_km2:           { label: "🗺️ Area",          unit: "km2c",    invert: false },
  };

  const TOTAL_ROUNDS = 8;
  const REVEAL_DELAY_MS = 1100;
  const fullFmt = new Intl.NumberFormat("en-US");
  const compactFmt = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const els = {
    score: null, // not displayed in main view; shown on end screen via finalScore
    round: document.getElementById("round"),
    totalRounds: document.getElementById("total-rounds"),
    statLabel: document.getElementById("stat-label"),
    stat: document.getElementById("stat"),
    topCountry: document.getElementById("top-country"),
    topFlag: document.getElementById("top-flag"),
    topName: document.getElementById("top-name"),
    topValue: document.getElementById("top-value"),
    bottomCountry: document.getElementById("bottom-country"),
    bottomFlag: document.getElementById("bottom-flag"),
    bottomName: document.getElementById("bottom-name"),
    bottomValue: document.getElementById("bottom-value"),
    choiceButtons: document.getElementById("choice-buttons"),
    board: document.getElementById("board"),
    startScreen: document.getElementById("start-screen"),
    startBtn: document.getElementById("start-btn"),
    endScreen: document.getElementById("end-screen"),
    endTitle: document.getElementById("end-title"),
    finalScore: document.getElementById("final-score"),
    finalTotal: document.getElementById("final-total"),
    playAgain: document.getElementById("play-again"),
    loading: document.getElementById("loading"),
  };

  const state = {
    countries: [],
    top: null,    // hidden value — what user is guessing
    bottom: null, // revealed value — reference
    stat: "passport_rank",
    score: 0,
    round: 0,
    locked: false,
  };

  function formatValue(stat, value) {
    const meta = STAT_META[stat];
    if (meta.unit === "rank")    return "Rank " + value;
    if (meta.unit === "usd")     return "$" + fullFmt.format(value);
    if (meta.unit === "km")      return fullFmt.format(value) + " km";
    if (meta.unit === "compact") return compactFmt.format(value);
    if (meta.unit === "km2c")    return compactFmt.format(value) + " km²";
    return fullFmt.format(value);
  }

  function effectiveValue(country, stat) {
    const v = country[stat];
    return STAT_META[stat].invert ? -v : v;
  }

  function pickRandom(exclude) {
    const pool = exclude
      ? state.countries.filter(c => c.code !== exclude.code)
      : state.countries;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function flagSrc(country) {
    return `https://flagcdn.com/w320/${country.code.toLowerCase()}.png`;
  }
  function flagSrcSet(country) {
    return `https://flagcdn.com/w640/${country.code.toLowerCase()}.png 2x`;
  }

  function renderBottom(country) {
    els.bottomFlag.src = flagSrc(country);
    els.bottomFlag.srcset = flagSrcSet(country);
    els.bottomFlag.alt = `Flag of ${country.name}`;
    els.bottomName.textContent = country.name;
    els.bottomValue.textContent = formatValue(state.stat, country[state.stat]);
  }

  function renderTopHidden(country) {
    els.topFlag.src = flagSrc(country);
    els.topFlag.srcset = flagSrcSet(country);
    els.topFlag.alt = `Flag of ${country.name}`;
    els.topName.textContent = country.name;
    els.topValue.textContent = "•••";
    els.topValue.classList.add("country__value--hidden");
  }

  function revealTop(country) {
    els.topValue.textContent = formatValue(state.stat, country[state.stat]);
    els.topValue.classList.remove("country__value--hidden");
  }

  function showRound() {
    els.round.textContent = state.round;
    els.statLabel.textContent = STAT_META[state.stat].label;
    renderBottom(state.bottom);
    renderTopHidden(state.top);
    els.choiceButtons.classList.remove("hidden");
    els.topCountry.classList.remove("correct", "wrong");
    els.bottomCountry.classList.remove("correct", "wrong");
    state.locked = false;
  }

  function startRound(keepBottom) {
    state.round += 1;
    if (!keepBottom) state.bottom = pickRandom(null);
    state.top = pickRandom(state.bottom);
    showRound();
  }

  function handleChoice(choice) {
    if (state.locked) return;
    state.locked = true;

    const tv = effectiveValue(state.top, state.stat);
    const bv = effectiveValue(state.bottom, state.stat);

    let correct;
    if (tv === bv) correct = true;
    else if (choice === "higher") correct = tv > bv;
    else correct = tv < bv;

    revealTop(state.top);
    els.choiceButtons.classList.add("hidden");
    els.topCountry.classList.add(correct ? "correct" : "wrong");

    if (correct) state.score += 1;

    setTimeout(() => {
      if (!correct) return endGame(false);
      if (state.round >= TOTAL_ROUNDS) return endGame(true);
      // Auto-advance: top becomes new bottom, draw new top.
      state.bottom = state.top;
      startRound(true);
    }, REVEAL_DELAY_MS);
  }

  function endGame(won) {
    els.board.classList.add("hidden");
    els.endTitle.textContent = won ? "🏆 You win!" : "💥 Game over";
    els.endTitle.classList.remove("win", "lose");
    els.endTitle.classList.add(won ? "win" : "lose");
    els.finalScore.textContent = state.score;
    els.endScreen.classList.remove("hidden");
  }

  function startGame() {
    state.score = 0;
    state.round = 0;
    els.startScreen.classList.add("hidden");
    els.endScreen.classList.add("hidden");
    els.board.classList.remove("hidden");
    startRound(false);
  }

  function backToStart() {
    els.endScreen.classList.add("hidden");
    els.board.classList.add("hidden");
    els.startScreen.classList.remove("hidden");
  }

  async function init() {
    els.totalRounds.textContent = TOTAL_ROUNDS;
    els.finalTotal.textContent = TOTAL_ROUNDS;

    try {
      const res = await fetch("../data/countries.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.countries = await res.json();
    } catch (err) {
      els.loading.textContent =
        "Could not load countries.json — serve over http://, not file:// (" + err.message + ")";
      els.startBtn.disabled = true;
      return;
    }
    if (state.countries.length < 2) {
      els.loading.textContent = "Need at least 2 countries in countries.json.";
      els.startBtn.disabled = true;
      return;
    }

    els.loading.classList.add("hidden");
    els.stat.value = state.stat;

    els.startBtn.addEventListener("click", startGame);
    els.playAgain.addEventListener("click", backToStart);
    els.choiceButtons.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-choice]");
      if (btn) handleChoice(btn.dataset.choice);
    });
    els.stat.addEventListener("change", () => {
      state.stat = els.stat.value;
    });
  }

  init();
})();
