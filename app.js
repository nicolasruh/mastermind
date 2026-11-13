"use strict";

const palette = [
  { name: "Gelb", color: "#edc545" }, { name: "Orange", color: "#ee9250" },
  { name: "Rot", color: "#dd6270" }, { name: "Grün", color: "#62ae93" },
  { name: "Blau", color: "#6d99d5" }, { name: "Violett", color: "#aa82c3" }
];
const byId = id => document.getElementById(id);
let game;
let activeMode = "breaker";
let solverWorker = null;
let solverTimeout = null;
let makerBusy = false;
let pendingFeedback = null;
let breakerPendingGuess = null;
let gameNumber = 0;
let configurationPending = false;
let phase = "code";
let turnTimer = null;
let animationSerial = 0;
let solverStarted = 0;
let scorePins = [];
let feedbackFocus = null;

function peg(color, hidden = false) {
  const element = document.createElement("span");
  element.className = hidden ? "peg hidden-peg" : "peg";
  element.textContent = hidden ? "?" : String(color);
  if (!hidden) {
    element.style.setProperty("--peg-color", palette[color - 1].color);
    element.setAttribute("aria-label", `${color}: ${palette[color - 1].name}`);
  }
  return element;
}

function showMessage(id, text, error = false) {
  byId(id).textContent = text;
  byId(id).classList.toggle("error", error);
}

function showFeedback(text, focus = document.activeElement) {
  if (!byId("feedback-dialog").open) feedbackFocus = focus;
  byId("feedback-text").textContent = text;
  if (!byId("feedback-dialog").open) byId("feedback-dialog").showModal();
}

function closeFeedback() {
  byId("feedback-dialog").close();
  if (feedbackFocus instanceof HTMLElement && feedbackFocus.isConnected && !feedbackFocus.disabled) feedbackFocus.focus();
}
byId("feedback-ok").addEventListener("click", closeFeedback);
document.addEventListener("keydown", event => {
  if (byId("feedback-dialog").open && event.key === "Escape") {
    event.preventDefault();
    closeFeedback();
  }
});

function stopTurn() {
  clearTimeout(turnTimer);
  turnTimer = null;
  animationSerial++;
}

function scheduleTurn(callback, delay = 500) {
  clearTimeout(turnTimer);
  const serial = animationSerial;
  turnTimer = setTimeout(() => {
    turnTimer = null;
    if (serial === animationSerial && !configurationPending) callback();
  }, delay);
}

function stopSolver() {
  if (solverWorker) solverWorker.terminate();
  solverWorker = null;
  clearTimeout(solverTimeout);
  makerBusy = false;
  pendingFeedback = null;
}

function scoreDots(container, feedback, positions) {
  container.replaceChildren();
  for (let index = 0; index < positions; index++) {
    const dot = document.createElement("span");
    dot.className = `feedback-pin ${index < feedback.black ? "black" : index < feedback.black + feedback.white ? "white" : "unused"}`;
    container.append(dot);
  }
  container.setAttribute("aria-label", `Score (${feedback.black}, ${feedback.white})`);
}

function renderHistory() {
  byId("history").replaceChildren();
  if (configurationPending) { byId("round-count").textContent = "Nicht gestartet"; return; }
  const history = game.history;
  const rows = activeMode === "breaker" ? Mastermind.MAX_ATTEMPTS : Math.max(8, history.length + (game.status === "playing" ? 1 : 0));
  for (let index = 0; index < rows; index++) {
    const entry = history[index];
    const guess = entry ? entry.guess : index === history.length && game.status === "playing" ? activeMode === "maker" ? game.current : breakerPendingGuess : null;
    const row = document.createElement("li");
    row.className = `history-row${entry ? " completed" : ""}${index === history.length && game.status === "playing" ? " current" : ""}`;
    if (entry && entry.source) row.title = entry.source === "auto" ? "Score automatisch berechnet" : "Score manuell";
    const number = document.createElement("span");
    number.className = "row-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const code = document.createElement("div");
    code.className = "peg-row";
    for (let position = 0; position < game.config.positions; position++) {
      if (guess) code.append(peg(guess[position]));
      else {
        const empty = document.createElement("span");
        empty.className = "empty-peg";
        code.append(empty);
      }
    }
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    if (entry) scoreDots(feedback, entry.feedback, game.config.positions);
    else feedback.textContent = "—";
    row.append(number, code, feedback);
    byId("history").append(row);
  }
  byId("round-count").textContent = activeMode === "maker"
    ? game.status === "setup" ? "Code wählen" : game.status === "won" ? `${history.length} Guesses · Gelöst` : `Guess ${history.length + 1}`
    : game.status === "playing" ? `Guess ${history.length + 1} / 8` : `${history.length} / 8 · ${game.status === "won" ? "Gelöst" : "Beendet"}`;
}

function renderSecret() {
  byId("secret-code").replaceChildren();
  if (configurationPending) {
    byId("secret-code").setAttribute("aria-label", "Kein Code");
    byId("secret-code").parentElement.hidden = true;
    return;
  }
  const revealed = activeMode === "maker" ? game.secret || game.revealedCode : game.revealedCode;
  if (activeMode === "breaker" && phase === "code") {
    for (let index = 0; index < game.config.positions; index++) {
      const dice = document.createElement("span");
      dice.className = "dice";
      dice.textContent = "\u2684";
      byId("secret-code").append(dice);
    }
    byId("secret-code").setAttribute("aria-label", "Computer wählt den Code");
  } else {
    byId("secret-code").append(...Array.from({ length: game.config.positions }, (_, index) => peg(revealed ? revealed[index] : null, !revealed)));
    byId("secret-code").setAttribute("aria-label", revealed ? `Code ${revealed.join("")}` : "Geheimer Code");
  }
  byId("secret-label").textContent = "Code";
  byId("secret-code").parentElement.hidden = activeMode === "maker" && game.status === "setup";
}

function renderInputs(containerId) {
  const container = byId(containerId);
  container.replaceChildren();
  for (let position = 0; position < game.config.positions; position++) {
    const input = document.createElement("div");
    input.className = "position-input";
    input.setAttribute("role", "group");
    input.setAttribute("aria-label", `Position ${position + 1}`);
    const title = document.createElement("span");
    title.textContent = `Position ${position + 1}`;
    const wheel = document.createElement("div");
    wheel.className = "color-wheel";
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "peg input-preview hidden-peg";
    preview.textContent = "?";
    preview.dataset.value = "";
    preview.setAttribute("aria-label", `Position ${position + 1}: keine Farbe gewählt. Nächste Farbe wählen`);
    preview.title = "Klicken: nächste Farbe";
    preview.addEventListener("click", () => {
      setInputColor(input, Number(preview.dataset.value) % game.config.colors + 1);
    });
    wheel.append(preview);
    palette.slice(0, game.config.colors).forEach((color, index) => {
      const option = document.createElement("button");
      const angle = -Math.PI / 2 + index * 2 * Math.PI / game.config.colors;
      option.type = "button";
      option.className = "color-option";
      option.dataset.value = String(index + 1);
      option.style.setProperty("--peg-color", color.color);
      option.style.setProperty("--x", `${Math.cos(angle) * 34}px`);
      option.style.setProperty("--y", `${Math.sin(angle) * 34}px`);
      option.textContent = String(index + 1);
      option.setAttribute("aria-label", `Position ${position + 1}: ${index + 1} ${color.name} wählen`);
      option.setAttribute("aria-pressed", "false");
      option.addEventListener("click", () => setInputColor(input, index + 1));
      wheel.append(option);
    });
    input.append(title, wheel);
    container.append(input);
  }
}

function setInputColor(input, color) {
  const preview = input.querySelector(".input-preview");
  preview.dataset.value = String(color);
  preview.classList.remove("hidden-peg");
  preview.textContent = String(color);
  preview.style.setProperty("--peg-color", palette[color - 1].color);
  preview.setAttribute("aria-label", `${input.getAttribute("aria-label")}: ${color} ${palette[color - 1].name}. Nächste Farbe wählen`);
  input.querySelectorAll(".color-option").forEach(option => {
    option.setAttribute("aria-pressed", String(Number(option.dataset.value) === color));
  });
}

function readCode(containerId) {
  const inputs = [...byId(containerId).querySelectorAll(".input-preview")];
  const missing = inputs.find(input => !input.dataset.value);
  if (missing) {
    missing.focus();
    throw new Error("Wähle für jede Position eine Farbe.");
  }
  const code = inputs.map(input => Number(input.dataset.value));
  Mastermind.validateCode(code, game.config);
  return code;
}

function renderActors() {
  const humanRole = activeMode === "maker" ? "Codemaker" : "Codebreaker";
  for (const [actor, role] of [["human", humanRole], ["computer", activeMode === "maker" ? "Codebreaker" : "Codemaker"]]) {
    byId(`${actor}-role`).textContent = role;
    byId(`${actor}-task`).textContent = role === "Codemaker" ? "Code wählen · Score vergeben" : "Guess wählen";
    byId(`${actor}-role`).title = byId(`${actor}-task`).textContent;
  }
  byId("guess-actor").textContent = `Guesses · ${activeMode === "maker" ? "C" : "M"}`;
  byId("score-actor").textContent = `Scores · ${activeMode === "maker" ? "M" : "C"}`;
  byId("guess-actor").className = activeMode === "maker" ? "computer-text" : "human-text";
  byId("score-actor").className = activeMode === "maker" ? "human-text" : "computer-text";
  byId("mode-title").textContent = `Mensch: ${humanRole}`;
  document.title = `Mastermind · Mensch: ${humanRole}`;
}

function renderFlow() {
  const maker = activeMode === "maker";
  const current = configurationPending ? -1 : phase === "code" ? 0 : phase === "guess" ? 1 : phase === "score" ? 2 : -1;
  const names = ["Code wählen", "Guess wählen", "Score vergeben"];
  byId("flow-steps").replaceChildren(...names.map((text, index) => {
    const item = document.createElement("li");
    const computer = index === 1 ? maker : !maker;
    item.textContent = `${index + 1}. ${computer ? "C" : "M"} · ${text}`;
    item.className = current === index ? "active" : !configurationPending && (phase === "finished" || index === 0 && phase !== "code" || index < current) ? "done" : "";
    if (current === index) item.setAttribute("aria-current", "step");
    const area = byId(["code-turn", "guess-turn", "score-turn"][index]);
    area.className = `turn-area ${computer ? "computer" : "human"}${current === index ? " active" : ""}${computer && current === index ? " thinking" : ""}`;
    area.querySelector(".turn-actor").textContent = computer ? "C" : "M";
    area.querySelector(".turn-status").textContent = current === index ? computer ? "Computer ist dran" : "Du bist dran" : item.className === "done" ? "Erledigt" : "Wartet";
    return item;
  }));
  byId("next-step").textContent = configurationPending ? "Neues Spiel starten" : phase === "finished" ? "Spiel beendet" : phase === "error" ? "Berechnung unterbrochen" : `${current + 1}. ${names[current]}`;
  byId("step-instruction").textContent = configurationPending ? "Starte das Spiel mit der gewählten Konfiguration."
    : phase === "finished" ? "Mit dem Startknopf neu beginnen." : phase === "error" ? "Starte ein neues Spiel."
      : current === 0 ? maker ? "Farben wählen, dann Code festlegen." : "Der Computer wählt den geheimen Code."
        : current === 1 ? maker ? "Knuth vergleicht die Testguesses." : "Farben wählen, dann Guess abgeben."
          : maker ? "Pins anklicken oder die Anzahlen wählen. Dann bestätigen oder automatisch bewerten." : "Der Computer berechnet den Score.";
}

function renderScorePins(focusIndex) {
  byId("score-pins").replaceChildren(...scorePins.map((state, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `score-pin ${["unused", "white", "black"][state]}`;
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Score-Pin ${index + 1}: ${["leer", "weiss", "schwarz"][state]}`);
    button.title = "Klicken: leer → weiss → schwarz → leer";
    return button;
  }));
  if (focusIndex !== undefined) byId("score-pins").children[focusIndex].focus();
}

function resetScore() {
  scorePins = Array(game.config.positions).fill(0);
  for (const id of ["black-feedback", "white-feedback"]) byId(id).value = "0";
  renderScorePins();
}

function renderAll() {
  renderFlow();
  renderSecret();
  renderHistory();
  const maker = activeMode === "maker";
  byId("guess-form").hidden = configurationPending || maker;
  byId("maker-setup").hidden = configurationPending || !maker || game.status !== "setup";
  byId("feedback-form").hidden = configurationPending || !maker || phase !== "score" && phase !== "finished";
  byId("feedback-form").querySelector(".score-inputs").hidden = phase !== "score";
  byId("feedback-form").querySelector(".feedback-actions").hidden = phase !== "score";
  byId("computer-guess").hidden = configurationPending || !maker || game.status === "setup";
  if (!byId("computer-guess").hidden) {
    byId("computer-guess").replaceChildren(...(makerBusy ? [Object.assign(document.createElement("span"), { className: "thinking-symbol", textContent: "…" })] : (game.current || (phase === "finished" && game.history.length ? game.history[game.history.length - 1].guess : [])).map(color => peg(color))));
  }
  byId("computer-score").hidden = configurationPending || maker || !game.history.length && phase !== "score";
  if (!byId("computer-score").hidden) {
    scoreDots(byId("computer-score"), phase === "score" ? { black: 0, white: 0 } : game.history[game.history.length - 1].feedback, game.config.positions);
    byId("computer-score").classList.toggle("scoring", phase === "score");
  }
  for (const id of ["guess-inputs", "maker-inputs"]) {
    const enabled = !configurationPending && (id === "guess-inputs" ? !maker && phase === "guess" : maker && phase === "code");
    byId(id).querySelectorAll("button").forEach(input => { input.disabled = !enabled; });
  }
  byId("submit-guess").disabled = configurationPending || phase !== "guess";
  byId("undo-feedback").hidden = configurationPending || !maker || !game.history.length;
  byId("undo-feedback").disabled = makerBusy || phase === "error";
}

function settingsConfig() {
  return { positions: Number(byId("positions").value), colors: Number(byId("colors").value), repetitions: byId("repetitions").checked };
}

function startGame(focus = false) {
  try { Mastermind.validateConfig(settingsConfig()); }
  catch (error) { showMessage("settings-message", error.message, true); return; }
  stopTurn();
  stopSolver();
  configurationPending = false;
  breakerPendingGuess = null;
  activeMode = byId("mode").value;
  gameNumber++;
  const config = Object.freeze(settingsConfig());
  game = activeMode === "breaker" ? Mastermind.createGame(config) : { config, history: [], status: "setup", current: null, secret: null, revealedCode: null, count: null };
  phase = "code";
  renderActors();
  renderInputs(activeMode === "maker" ? "maker-inputs" : "guess-inputs");
  for (const id of ["black-feedback", "white-feedback"]) {
    byId(id).replaceChildren(...Array.from({ length: config.positions + 1 }, (_, value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      return option;
    }));
  }
  resetScore();
  for (const id of ["guess-error", "maker-error", "feedback-error", "game-message", "settings-message"]) showMessage(id, "");
  byId("active-rules").textContent = `Spiel ${gameNumber} · ${config.positions} Positionen · ${config.colors} Farben · ${config.repetitions ? "mit" : "ohne"} Wiederholungen`;
  byId("solver-note").hidden = activeMode !== "maker";
  byId("show-explorer").disabled = activeMode === "breaker";
  explorer.reset(config, activeMode, [], false);
  renderAll();
  if (activeMode === "breaker") scheduleTurn(() => {
    phase = "guess";
    renderAll();
    byId("show-explorer").disabled = false;
    explorer.updateBreaker([], true);
    if (focus) byId("guess-inputs").querySelector("button").focus();
  });
  else if (focus) byId("maker-inputs").querySelector("button").focus();
}

function clearGame() {
  stopTurn();
  stopSolver();
  configurationPending = true;
  breakerPendingGuess = null;
  activeMode = byId("mode").value;
  renderActors();
  explorer.reset(game.config, activeMode, [], false);
  byId("show-explorer").disabled = true;
  byId("active-rules").textContent = "Nicht gestartet";
  showMessage("game-message", "");
  for (const id of ["guess-inputs", "maker-inputs", "computer-guess", "computer-score", "score-pins"]) byId(id).replaceChildren();
  renderAll();
  try { Mastermind.validateConfig(settingsConfig()); showMessage("settings-message", "Spiel geleert. Mit dem Startknopf neu beginnen."); }
  catch (error) { showMessage("settings-message", error.message, true); }
}

function solverFailed(text, fatal = false) {
  if (fatal) {
    stopTurn();
    stopSolver();
    phase = "error";
    game.status = "error";
    explorer.fail(text);
    showMessage("game-message", text, true);
  } else showFeedback(text);
  renderAll();
}

function requestSolver(initial = false) {
  const worker = solverWorker;
  makerBusy = true;
  phase = "guess";
  solverStarted = performance.now();
  renderAll();
  explorer.loading();
  clearTimeout(solverTimeout);
  solverTimeout = setTimeout(() => {
    if (solverWorker === worker) solverFailed("Die Berechnung hat zu lange gedauert. Starte ein neues Spiel.", true);
  }, 30000);
  try {
    worker.postMessage({ ...(initial ? { config: game.config } : {}), history: pendingFeedback ? [...game.history, pendingFeedback] : game.history, details: true });
  } catch (error) { solverFailed(error.message, true); }
}

function startComputer() {
  if (configurationPending || activeMode !== "maker" || game.status !== "setup") return;
  try {
    game.secret = readCode("maker-inputs");
    const worker = MastermindSolver.createWorker(Mastermind);
    solverWorker = worker;
    worker.onmessage = event => {
      if (solverWorker !== worker) return;
      clearTimeout(solverTimeout);
      if (event.data.error) { solverFailed(event.data.error, true); return; }
      const result = event.data.result;
      scheduleTurn(() => {
        if (solverWorker !== worker) return;
        if (pendingFeedback) game.history.push(pendingFeedback);
        pendingFeedback = null;
        makerBusy = false;
        game.count = result.count;
        game.current = result.guess;
        game.status = result.guess === null ? "won" : "playing";
        phase = result.guess === null ? "finished" : "score";
        if (result.guess === null) {
          game.revealedCode = [...game.history[game.history.length - 1].guess];
          showMessage("game-message", `Code gefunden · ${game.history.length} Guesses.`);
        }
        resetScore();
        renderAll();
        explorer.setMaker(result.details);
      }, Math.max(0, 500 - (performance.now() - solverStarted)));
    };
    worker.onerror = event => {
      event.preventDefault();
      if (solverWorker === worker) solverFailed("Der Solver konnte nicht ausgeführt werden. Starte ein neues Spiel.", true);
    };
    worker.onmessageerror = () => {
      if (solverWorker === worker) solverFailed("Die Solver-Antwort konnte nicht gelesen werden. Starte ein neues Spiel.", true);
    };
    game.status = "playing";
    requestSolver(true);
  } catch (error) {
    stopTurn();
    stopSolver();
    game.status = "setup";
    game.secret = null;
    phase = "code";
    renderAll();
    showFeedback(error.message);
  }
}

function assessComputer(automatic) {
  if (configurationPending || activeMode !== "maker" || phase !== "score" || makerBusy) return;
  try {
    const expected = Mastermind.scoreGuess(game.secret, game.current);
    const feedback = automatic ? expected : { black: Number(byId("black-feedback").value), white: Number(byId("white-feedback").value) };
    Mastermind.validateFeedback(feedback, game.config.positions);
    if (feedback.black !== expected.black || feedback.white !== expected.white) throw new Error(`Dieser Score passt nicht zum Guess. Dein Code ergibt Score (${expected.black}, ${expected.white}).`);
    pendingFeedback = { guess: [...game.current], feedback, source: automatic ? "auto" : "manual" };
    requestSolver();
  } catch (error) { resetScore(); solverFailed(error.message); }
}

byId("settings-form").addEventListener("change", clearGame);
byId("settings-form").addEventListener("submit", event => { event.preventDefault(); startGame(true); });
byId("maker-setup").addEventListener("submit", event => { event.preventDefault(); startComputer(); });
byId("feedback-form").addEventListener("submit", event => { event.preventDefault(); assessComputer(false); });
byId("auto-feedback").addEventListener("click", () => assessComputer(true));
byId("score-pins").addEventListener("click", event => {
  const button = event.target.closest("button[data-index]");
  if (!button || phase !== "score") return;
  const index = Number(button.dataset.index);
  scorePins[index] = (scorePins[index] + 1) % 3;
  byId("black-feedback").value = String(scorePins.filter(state => state === 2).length);
  byId("white-feedback").value = String(scorePins.filter(state => state === 1).length);
  renderScorePins(index);
});
for (const id of ["black-feedback", "white-feedback"]) byId(id).addEventListener("change", () => {
  try {
    const black = Number(byId("black-feedback").value);
    const white = Number(byId("white-feedback").value);
    Mastermind.validateFeedback({ black, white }, game.config.positions);
    scorePins = Array.from({ length: game.config.positions }, (_, index) => index < black ? 2 : index < black + white ? 1 : 0);
    renderScorePins();
  } catch (error) { resetScore(); showFeedback(error.message); }
});
byId("undo-feedback").addEventListener("click", () => {
  if (configurationPending || activeMode !== "maker" || makerBusy || !solverWorker || !game.history.length) return;
  game.history.pop();
  game.status = "playing";
  game.revealedCode = null;
  game.current = null;
  showMessage("game-message", "");
  requestSolver();
});
byId("guess-form").addEventListener("submit", event => {
  event.preventDefault();
  if (configurationPending || activeMode !== "breaker" || phase !== "guess") return;
  try {
    const guess = readCode("guess-inputs");
    breakerPendingGuess = guess;
    phase = "score";
    byId("show-explorer").disabled = true;
    renderAll();
    scheduleTurn(() => {
      game.submit(guess);
      breakerPendingGuess = null;
      phase = game.status === "playing" ? "guess" : "finished";
      renderAll();
      explorer.updateBreaker(game.history, game.status === "playing");
      byId("show-explorer").disabled = false;
      if (game.status !== "playing") showMessage("game-message", game.status === "won" ? `Code gefunden · ${game.history.length} Guesses.` : "Acht Guesses aufgebraucht. Der Code ist aufgedeckt.");
    });
  } catch (error) { showFeedback(error.message); }
});
const explorer = MastermindExplorer.createView({
  peg, notify: showFeedback,
  applyGuess(guess) {
    if (configurationPending || activeMode !== "breaker" || phase !== "guess") throw new Error("Dieser Guess kann nicht übernommen werden. Starte ein neues Spiel.");
    byId("guess-inputs").querySelectorAll(".position-input").forEach((input, index) => {
      setInputColor(input, guess[index]);
    });
    byId("guess-inputs").querySelector("button").focus();
  }
});
window.addEventListener("pagehide", () => { stopTurn(); stopSolver(); explorer.stop(); });
startGame();
