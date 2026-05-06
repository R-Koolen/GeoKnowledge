(() => {
  const MIN_OPTIMAL_INTERMEDIATES = 2;   // distance >= 3
  const MAX_OPTIMAL_INTERMEDIATES = 6;   // distance <= 7

  const els = {
    // start screen
    startScreen: document.getElementById("start-screen"),
    startBtn: document.getElementById("start-btn"),
    loading: document.getElementById("loading"),
    // board
    board: document.getElementById("board"),
    startFlag: document.getElementById("start-flag"),
    startName: document.getElementById("start-name"),
    endFlag: document.getElementById("end-flag"),
    endName: document.getElementById("end-name"),
    chain: document.getElementById("chain"),
    addForm: document.getElementById("add-form"),
    countryInput: document.getElementById("country-input"),
    countryOptions: document.getElementById("country-options"),
    addMsg: document.getElementById("add-msg"),
    submitBtn: document.getElementById("submit-btn"),
    giveupBtn: document.getElementById("giveup-btn"),
    // end screen
    endScreen: document.getElementById("end-screen"),
    endTitle: document.getElementById("end-title"),
    endSummary: document.getElementById("end-summary"),
    endBest: document.getElementById("end-best"),
    playAgain: document.getElementById("play-again"),
  };

  const state = {
    countries: [],
    byCode: {},        // CCA2 → country
    byNameLower: {},   // "netherlands" → country
    start: null,
    end: null,
    optimalDistance: 0,
    optimalPath: [],   // [country, country, ...]
    chain: [],         // [country, ...] starting with state.start
  };

  // ---------- BFS ---------------------------------------------------------

  function bfsFrom(startCode) {
    const dist = { [startCode]: 0 };
    const prev = { [startCode]: null };
    const queue = [startCode];
    while (queue.length) {
      const code = queue.shift();
      const c = state.byCode[code];
      if (!c) continue;
      for (const nb of c.borders || []) {
        if (nb in dist) continue;
        if (!state.byCode[nb]) continue;
        dist[nb] = dist[code] + 1;
        prev[nb] = code;
        queue.push(nb);
      }
    }
    return { dist, prev };
  }

  function reconstructPath(prev, endCode) {
    const path = [];
    let cur = endCode;
    while (cur != null) {
      path.unshift(state.byCode[cur]);
      cur = prev[cur];
    }
    return path;
  }

  // ---------- pair selection ---------------------------------------------

  function pickPair() {
    const candidates = state.countries.filter(c => (c.borders || []).length > 0);
    // Try several starts until we find one with a suitable end.
    for (let attempt = 0; attempt < 50; attempt++) {
      const start = candidates[Math.floor(Math.random() * candidates.length)];
      const { dist, prev } = bfsFrom(start.code);
      const ends = Object.keys(dist).filter(code => {
        const d = dist[code];
        return d >= MIN_OPTIMAL_INTERMEDIATES + 1 &&
               d <= MAX_OPTIMAL_INTERMEDIATES + 1;
      });
      if (!ends.length) continue;
      const endCode = ends[Math.floor(Math.random() * ends.length)];
      const end = state.byCode[endCode];
      return {
        start,
        end,
        distance: dist[endCode],
        path: reconstructPath(prev, endCode),
      };
    }
    // Last resort: any reachable pair.
    const start = candidates[0];
    const { dist, prev } = bfsFrom(start.code);
    const ends = Object.keys(dist).filter(c => dist[c] > 0);
    const endCode = ends[Math.floor(Math.random() * ends.length)];
    return {
      start,
      end: state.byCode[endCode],
      distance: dist[endCode],
      path: reconstructPath(prev, endCode),
    };
  }

  // ---------- rendering --------------------------------------------------

  function flagSrc(c)    { return `https://flagcdn.com/w320/${c.code.toLowerCase()}.png`; }
  function flagSrcSet(c) { return `https://flagcdn.com/w640/${c.code.toLowerCase()}.png 2x`; }

  function setEndpoint(side, country) {
    els[side + "Flag"].src = flagSrc(country);
    els[side + "Flag"].srcset = flagSrcSet(country);
    els[side + "Flag"].alt = `Flag of ${country.name}`;
    els[side + "Name"].textContent = country.name;
  }

  function bordersPrev(country, prev) {
    if (!prev) return true;
    return (prev.borders || []).includes(country.code);
  }

  function chipFor(country, kind) {
    const li = document.createElement("li");
    li.className = "chip";
    if (kind === "start") li.classList.add("chip--start");
    else if (kind === "end") li.classList.add("chip--end");
    else if (kind === "good") li.classList.add("chip--good");
    else if (kind === "bad")  li.classList.add("chip--bad");
    li.textContent = country.name;
    return li;
  }

  function renderChain() {
    els.chain.innerHTML = "";
    state.chain.forEach((c, i) => {
      if (i > 0) {
        const sep = document.createElement("li");
        sep.className = "chain__sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "→";
        els.chain.appendChild(sep);
      }
      const isStart = i === 0;
      let kind;
      if (isStart) {
        kind = "start";
      } else {
        kind = bordersPrev(c, state.chain[i - 1]) ? "good" : "bad";
      }
      const chip = chipFor(c, kind);
      if (!isStart) {
        const x = document.createElement("button");
        x.type = "button";
        x.className = "chip__remove";
        x.setAttribute("aria-label", `Remove ${c.name}`);
        x.textContent = "×";
        x.addEventListener("click", () => removeAt(i));
        chip.appendChild(x);
      }
      els.chain.appendChild(chip);
    });
    // Always show end as a faint target on the right
    const sep = document.createElement("li");
    sep.className = "chain__sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "→";
    els.chain.appendChild(sep);
    els.chain.appendChild(chipFor(state.end, "end"));
  }

  // ---------- chain actions ----------------------------------------------

  function lookupCountry(name) {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    return state.byNameLower[key] || null;
  }

  function flashInput(msg, kind) {
    els.addMsg.textContent = msg || "";
    els.addMsg.classList.remove("bad", "good");
    if (kind) els.addMsg.classList.add(kind);
    if (kind === "bad") {
      els.countryInput.classList.remove("shake");
      // force reflow to restart animation
      void els.countryInput.offsetWidth;
      els.countryInput.classList.add("shake");
    }
  }

  function tryAdd() {
    const raw = els.countryInput.value;
    const c = lookupCountry(raw);
    if (!c) {
      flashInput("Unknown country.", "bad");
      return;
    }
    if (c.code === state.start.code) {
      flashInput("That's the starting country.", "bad");
      return;
    }
    if (state.chain.some(x => x.code === c.code)) {
      flashInput("Already in the chain.", "bad");
      return;
    }
    const prev = state.chain[state.chain.length - 1];
    const ok = bordersPrev(c, prev);
    state.chain.push(c);
    flashInput(
      ok
        ? (c.code === state.end.code
            ? `${c.name} reaches the target.`
            : `${c.name} added.`)
        : `${c.name} doesn't border ${prev.name}.`,
      ok ? "good" : "bad"
    );
    els.countryInput.value = "";
    renderChain();
  }

  function removeAt(i) {
    if (i <= 0) return; // never remove the start
    state.chain.splice(i, 1);
    renderChain();
    flashInput("");
  }

  // ---------- submit / end -----------------------------------------------

  function chainReachesEnd() {
    if (state.chain.length < 2) return false;
    // Every adjacent pair valid AND last entry === end
    for (let i = 1; i < state.chain.length; i++) {
      if (!bordersPrev(state.chain[i], state.chain[i - 1])) return false;
    }
    return state.chain[state.chain.length - 1].code === state.end.code;
  }

  function submit() {
    if (chainReachesEnd()) {
      const userIntermediates = state.chain.length - 2; // exclude start & end
      finish(true, userIntermediates);
    } else {
      finish(false, null);
    }
  }

  function giveUp() {
    finish(false, null);
  }

  function finish(won, userIntermediates) {
    const optimalIntermediates = state.optimalDistance - 1;
    els.board.classList.add("hidden");

    els.endTitle.classList.remove("win", "lose");
    if (won) {
      els.endTitle.textContent = "🏆 Solved!";
      els.endTitle.classList.add("win");
      const delta = userIntermediates - optimalIntermediates;
      const summary = `Your chain: ${userIntermediates} intermediate${userIntermediates === 1 ? "" : "s"} · ` +
                      `Optimal: ${optimalIntermediates}`;
      const tag = delta === 0
        ? "Perfect — matched the optimal!"
        : `${delta} longer than the optimal.`;
      els.endSummary.textContent = `${summary}\n${tag}`;
    } else {
      els.endTitle.textContent = "💥 Didn't make it";
      els.endTitle.classList.add("lose");
      els.endSummary.textContent =
        `Optimal chain length: ${optimalIntermediates} intermediate${optimalIntermediates === 1 ? "" : "s"}.`;
    }
    els.endBest.textContent = `Best path: ${state.optimalPath.map(c => c.name).join(" → ")}`;
    els.endScreen.classList.remove("hidden");
  }

  // ---------- start / reset ----------------------------------------------

  function newRound() {
    const pair = pickPair();
    state.start = pair.start;
    state.end = pair.end;
    state.optimalDistance = pair.distance;
    state.optimalPath = pair.path;
    state.chain = [pair.start];

    setEndpoint("start", pair.start);
    setEndpoint("end", pair.end);
    flashInput("");
    els.countryInput.value = "";
    renderChain();
  }

  function startGame() {
    els.startScreen.classList.add("hidden");
    els.endScreen.classList.add("hidden");
    els.board.classList.remove("hidden");
    newRound();
    els.countryInput.focus();
  }

  function backToStart() {
    els.endScreen.classList.add("hidden");
    els.board.classList.add("hidden");
    els.startScreen.classList.remove("hidden");
  }

  // ---------- init -------------------------------------------------------

  async function init() {
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

    state.byCode = {};
    state.byNameLower = {};
    for (const c of state.countries) {
      state.byCode[c.code] = c;
      state.byNameLower[c.name.toLowerCase()] = c;
    }
    // Datalist (sorted alphabetically — countries.json already is).
    const frag = document.createDocumentFragment();
    for (const c of state.countries) {
      const opt = document.createElement("option");
      opt.value = c.name;
      frag.appendChild(opt);
    }
    els.countryOptions.appendChild(frag);

    if (state.countries.filter(c => (c.borders || []).length > 0).length < 5) {
      els.loading.textContent = "Not enough bordering countries in the dataset.";
      els.startBtn.disabled = true;
      return;
    }

    els.loading.classList.add("hidden");

    els.startBtn.addEventListener("click", startGame);
    els.playAgain.addEventListener("click", () => { backToStart(); startGame(); });
    els.addForm.addEventListener("submit", (e) => { e.preventDefault(); tryAdd(); });
    els.submitBtn.addEventListener("click", submit);
    els.giveupBtn.addEventListener("click", giveUp);
  }

  init();
})();
