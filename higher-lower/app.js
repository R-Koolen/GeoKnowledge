(() => {
  const STAT_META = {
    passport_rank:      { label: "Passport power", unit: "rank", invert: true },
    gdp_per_capita_usd: { label: "GDP per capita", unit: "usd",  invert: false },
    coastline_km:       { label: "Coastline",      unit: "km",   invert: false },
    population:         { label: "Population",     unit: "n",    invert: false },
    area_km2:           { label: "Area",           unit: "km2",  invert: false },
  };

  const BEST_KEY = "geoknowledge.bestScore";
  const numFmt = new Intl.NumberFormat("en-US");

  const els = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    stat: document.getElementById("stat"),
    leftCard: document.getElementById("left-card"),
    rightCard: document.getElementById("right-card"),
    leftFlag: document.getElementById("left-flag"),
    leftName: document.getElementById("left-name"),
    leftCapital: document.getElementById("left-capital"),
    leftContinent: document.getElementById("left-continent"),
    leftStatLabel: document.getElementById("left-stat-label"),
    leftStatValue: document.getElementById("left-stat-value"),
    rightFlag: document.getElementById("right-flag"),
    rightName: document.getElementById("right-name"),
    rightCapital: document.getElementById("right-capital"),
    rightContinent: document.getElementById("right-continent"),
    rightStatLabel: document.getElementById("right-stat-label"),
    rightStatValue: document.getElementById("right-stat-value"),
    choiceButtons: document.getElementById("choice-buttons"),
    nextBtn: document.getElementById("next-btn"),
    board: document.getElementById("board"),
    gameOver: document.getElementById("game-over"),
    finalScore: document.getElementById("final-score"),
    playAgain: document.getElementById("play-again"),
    loading: document.getElementById("loading"),
  };

  const state = {
    countries: [],
    left: null,
    right: null,
    stat: "passport_rank",
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY)) || 0,
    locked: false,
  };

  function formatValue(stat, value) {
    const meta = STAT_META[stat];
    if (meta.unit === "usd") return "$" + numFmt.format(value);
    if (meta.unit === "km")  return numFmt.format(value) + " km";
    if (meta.unit === "km2") return numFmt.format(value) + " km²";
    if (meta.unit === "rank") return "Rank " + value;
    return numFmt.format(value);
  }

  function effectiveValue(country, stat) {
    const v = country[stat];
    return STAT_META[stat].invert ? -v : v;
  }

  function pickRandom(exclude) {
    const pool = exclude ? state.countries.filter(c => c.code !== exclude.code) : state.countries;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderCountry(side, country) {
    const flagEl = els[side + "Flag"];
    flagEl.src = `https://flagcdn.com/w160/${country.code.toLowerCase()}.png`;
    flagEl.srcset = `https://flagcdn.com/w320/${country.code.toLowerCase()}.png 2x`;
    flagEl.alt = `Flag of ${country.name}`;
    els[side + "Name"].textContent = country.name;
    els[side + "Capital"].textContent = country.capital;
    els[side + "Continent"].textContent = country.continent;
    els[side + "StatLabel"].textContent = STAT_META[state.stat].label;
    els[side + "StatValue"].textContent = formatValue(state.stat, country[state.stat]);
  }

  function newRound(keepLeft = false) {
    state.locked = false;
    if (!keepLeft) state.left = pickRandom(null);
    state.right = pickRandom(state.left);

    renderCountry("left", state.left);
    renderCountry("right", state.right);

    els.rightStatValue.classList.add("hidden");
    els.choiceButtons.classList.remove("hidden");
    els.nextBtn.classList.add("hidden");
    els.leftCard.classList.remove("correct", "wrong");
    els.rightCard.classList.remove("correct", "wrong");
  }

  function handleChoice(choice) {
    if (state.locked) return;
    state.locked = true;

    const lv = effectiveValue(state.left, state.stat);
    const rv = effectiveValue(state.right, state.stat);

    let correct;
    if (rv === lv) correct = true; // tie counts as correct either way
    else if (choice === "higher") correct = rv > lv;
    else correct = rv < lv;

    els.rightStatValue.classList.remove("hidden");
    els.choiceButtons.classList.add("hidden");
    els.rightCard.classList.add(correct ? "correct" : "wrong");

    if (correct) {
      state.score += 1;
      els.score.textContent = state.score;
      if (state.score > state.best) {
        state.best = state.score;
        localStorage.setItem(BEST_KEY, String(state.best));
        els.best.textContent = state.best;
      }
      els.nextBtn.classList.remove("hidden");
    } else {
      setTimeout(showGameOver, 800);
    }
  }

  function showGameOver() {
    els.board.classList.add("hidden");
    els.finalScore.textContent = state.score;
    els.gameOver.classList.remove("hidden");
  }

  function resetGame() {
    state.score = 0;
    els.score.textContent = "0";
    els.gameOver.classList.add("hidden");
    els.board.classList.remove("hidden");
    newRound(false);
  }

  function nextRound() {
    // Right card becomes the new left card; draw a fresh right card.
    state.left = state.right;
    newRound(true);
  }

  function onStatChange() {
    state.stat = els.stat.value;
    // Re-render labels/values for current pair, but reset the round
    // so the right card hides its value again.
    renderCountry("left", state.left);
    renderCountry("right", state.right);
    els.rightStatValue.classList.add("hidden");
    els.choiceButtons.classList.remove("hidden");
    els.nextBtn.classList.add("hidden");
    els.leftCard.classList.remove("correct", "wrong");
    els.rightCard.classList.remove("correct", "wrong");
    state.locked = false;
  }

  async function init() {
    try {
      const res = await fetch("../data/countries.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.countries = await res.json();
    } catch (err) {
      els.loading.textContent = "Could not load countries.json — make sure you serve over http://, not file://. (" + err.message + ")";
      return;
    }
    if (state.countries.length < 2) {
      els.loading.textContent = "Need at least 2 countries in countries.json.";
      return;
    }

    els.loading.classList.add("hidden");
    els.best.textContent = state.best;
    els.stat.value = state.stat;

    els.choiceButtons.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-choice]");
      if (btn) handleChoice(btn.dataset.choice);
    });
    els.nextBtn.addEventListener("click", nextRound);
    els.playAgain.addEventListener("click", resetGame);
    els.stat.addEventListener("change", onStatChange);

    newRound(false);
  }

  init();
})();
