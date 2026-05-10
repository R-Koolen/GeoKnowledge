(() => {
  // 5 stats used for feedback per spec
  const COMPARE_STATS = [
    { key: "continent",          label: "Continent",      icon: "🌍", kind: "match" },
    { key: "coastline_km",       label: "Coastline",      icon: "🌊", kind: "num" },
    { key: "highest_point_m",    label: "Highest point",  icon: "⛰️", kind: "num" },
    { key: "gdp_per_capita_usd", label: "GDP per capita", icon: "💵", kind: "num" },
    { key: "population",         label: "Population",     icon: "👥", kind: "num" },
  ];

  const fullFmt    = new Intl.NumberFormat("en-US");
  const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  function fmtVal(key, val) {
    if (val == null) return "—";
    switch (key) {
      case "coastline_km":       return fullFmt.format(Math.round(val)) + " km";
      case "highest_point_m":    return fullFmt.format(Math.round(val)) + " m";
      case "gdp_per_capita_usd": return "$" + fullFmt.format(Math.round(val));
      case "population":         return compactFmt.format(val);
      default:                   return String(val);
    }
  }

  function flagSrc(code)    { return `https://flagcdn.com/w160/${code.toLowerCase()}.png`; }
  function flagSrcSet(code) { return `https://flagcdn.com/w320/${code.toLowerCase()}.png 2x`; }

  const els = {
    startScreen:   document.getElementById("start-screen"),
    startBtn:      document.getElementById("start-btn"),
    loading:       document.getElementById("loading"),
    board:         document.getElementById("board"),
    guessCount:    document.getElementById("guess-count"),
    addForm:       document.getElementById("add-form"),
    countryInput:  document.getElementById("country-input"),
    countryOptions:document.getElementById("country-options"),
    addMsg:        document.getElementById("add-msg"),
    guessList:     document.getElementById("guess-list"),
    endScreen:     document.getElementById("end-screen"),
    endTitle:      document.getElementById("end-title"),
    endSummary:    document.getElementById("end-summary"),
    reveal:        document.getElementById("reveal"),
    endGuessList:  document.getElementById("end-guess-list"),
    playAgain:     document.getElementById("play-again"),
  };

  const state = {
    allCountries: [],
    byCode: {},
    byNameLower: {},
    target: null,
    guesses: [],     // [{ country, feedback }]
    done: false,
  };

  // ── Setup ─────────────────────────────────────────────────────────────

  function pickTarget() {
    const playable = state.allCountries.filter(c =>
      COMPARE_STATS.every(s => c[s.key] != null)
    );
    return playable[Math.floor(Math.random() * playable.length)];
  }

  function newRound() {
    state.target = pickTarget();
    state.guesses = [];
    state.done = false;
    els.guessList.innerHTML = "";
    flashMsg("");
    els.guessCount.textContent = "0";
    els.countryInput.value = "";
    els.countryInput.disabled = false;
  }

  // ── Comparison ────────────────────────────────────────────────────────

  function compareCountry(guess) {
    const fb = {};
    for (const s of COMPARE_STATS) {
      const gv = guess[s.key];
      const tv = state.target[s.key];
      if (s.kind === "match") {
        fb[s.key] = gv === tv ? "match" : "miss";
      } else {
        if (gv == null || tv == null)      fb[s.key] = "unknown";
        else if (Math.abs(gv - tv) < 1e-9) fb[s.key] = "equal";
        else if (tv > gv)                  fb[s.key] = "up";   // target higher than guess
        else                               fb[s.key] = "down"; // target lower
      }
    }
    return fb;
  }

  // ── Render ────────────────────────────────────────────────────────────

  function chipHTML(stat, signal, guessVal) {
    const sig =
      signal === "match" ? "✓" :
      signal === "miss"  ? "✗" :
      signal === "up"    ? "▲" :
      signal === "down"  ? "▼" :
      signal === "equal" ? "=" : "?";
    const valueText = stat.kind === "match"
      ? (guessVal ?? "—")
      : fmtVal(stat.key, guessVal);
    return `<span class="fb-chip fb-chip--${signal}" title="${stat.label}">
      <span class="fb-chip__icon">${stat.icon}</span>
      <span class="fb-chip__val">${valueText}</span>
      <span class="fb-chip__sig">${sig}</span>
    </span>`;
  }

  function rowHTML(g, opts = {}) {
    const win = opts.win === true;
    return `
      <li class="guess-row${win ? " guess-row--win" : ""}">
        <span class="guess-row__name">
          <img class="guess-row__flag" src="${flagSrc(g.country.code)}" srcset="${flagSrcSet(g.country.code)}" alt="" />
          <span>${g.country.name}</span>
        </span>
        <span class="fb-chips">
          ${COMPARE_STATS.map(s => chipHTML(s, g.feedback[s.key], g.country[s.key])).join("")}
        </span>
      </li>
    `;
  }

  function appendGuessRow(g, opts) {
    // Newest at top
    els.guessList.insertAdjacentHTML("afterbegin", rowHTML(g, opts));
  }

  function flashMsg(text, kind) {
    els.addMsg.textContent = text || "";
    els.addMsg.classList.remove("bad", "good");
    if (kind) els.addMsg.classList.add(kind);
  }

  function shakeInput() {
    els.countryInput.classList.remove("shake");
    void els.countryInput.offsetWidth;
    els.countryInput.classList.add("shake");
  }

  // ── Guess flow ────────────────────────────────────────────────────────

  function tryGuess() {
    if (state.done) return;
    const raw = els.countryInput.value.trim().toLowerCase();
    if (!raw) return;
    const guess = state.byNameLower[raw];
    if (!guess) {
      flashMsg("Unknown country.", "bad");
      shakeInput();
      return;
    }
    if (state.guesses.some(g => g.country.code === guess.code)) {
      flashMsg("You already tried that.", "bad");
      shakeInput();
      return;
    }

    if (guess.code === state.target.code) {
      // Win — append a "win" row with all-match feedback
      const winFb = {};
      for (const s of COMPARE_STATS) winFb[s.key] = (s.kind === "match" ? "match" : "equal");
      const entry = { country: guess, feedback: winFb };
      state.guesses.push(entry);
      appendGuessRow(entry, { win: true });
      els.guessCount.textContent = state.guesses.length;
      flashMsg("");
      els.countryInput.value = "";
      finish(true);
      return;
    }

    const feedback = compareCountry(guess);
    const entry = { country: guess, feedback };
    state.guesses.push(entry);
    appendGuessRow(entry);
    els.guessCount.textContent = state.guesses.length;
    flashMsg("");
    els.countryInput.value = "";
    els.countryInput.focus();
  }

  // ── End screen ────────────────────────────────────────────────────────

  function renderReveal() {
    const t = state.target;
    const stats = COMPARE_STATS.map(s => `
      <li>
        <span>${s.icon} ${s.label}</span>
        <span>${s.kind === "match" ? t[s.key] : fmtVal(s.key, t[s.key])}</span>
      </li>
    `).join("");
    els.reveal.innerHTML = `
      <img class="flag" src="${flagSrc(t.code)}" srcset="${flagSrcSet(t.code)}" alt="Flag of ${t.name}" />
      <h3 class="reveal__name">${t.name}</h3>
      <ul class="reveal__stats">${stats}</ul>
    `;
  }

  function finish(won) {
    state.done = true;
    els.countryInput.disabled = true;
    const n = state.guesses.length;
    els.endTitle.textContent = won ? "🏆 Got it!" : "🤝 Revealed";
    els.endTitle.classList.remove("win", "lose");
    els.endTitle.classList.add(won ? "win" : "lose");
    els.endSummary.textContent = won
      ? `Solved in ${n} guess${n === 1 ? "" : "es"}.`
      : `The country was revealed.`;

    renderReveal();

    // Re-render full guess history (oldest first reads more naturally on the end screen)
    els.endGuessList.innerHTML = "";
    for (const g of state.guesses) {
      els.endGuessList.insertAdjacentHTML("beforeend",
        rowHTML(g, { win: g.country.code === state.target.code }));
    }

    setTimeout(() => {
      els.board.classList.add("hidden");
      els.endScreen.classList.remove("hidden");
    }, 350);
  }

  function startGame() {
    newRound();
    els.startScreen.classList.add("hidden");
    els.endScreen.classList.add("hidden");
    els.board.classList.remove("hidden");
    els.countryInput.focus();
  }

  // ── Init ──────────────────────────────────────────────────────────────

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

    state.byCode = {};
    state.byNameLower = {};
    for (const c of state.allCountries) {
      state.byCode[c.code] = c;
      state.byNameLower[c.name.toLowerCase()] = c;
    }
    const frag = document.createDocumentFragment();
    for (const c of state.allCountries) {
      const opt = document.createElement("option");
      opt.value = c.name;
      frag.appendChild(opt);
    }
    els.countryOptions.appendChild(frag);

    if (state.allCountries.filter(c => COMPARE_STATS.every(s => c[s.key] != null)).length < 1) {
      els.loading.textContent = "Not enough countries with full data to play.";
      els.startBtn.disabled = true;
      return;
    }

    els.loading.classList.add("hidden");

    els.startBtn.addEventListener("click", startGame);
    els.playAgain.addEventListener("click", startGame);
    els.addForm.addEventListener("submit", (e) => { e.preventDefault(); tryGuess(); });
  }

  init();
})();
