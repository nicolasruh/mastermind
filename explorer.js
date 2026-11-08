(function (root) {
  "use strict";

  function validateIndices(details, indices) {
    if (!Array.isArray(indices) || new Set(indices).size !== indices.length ||
        Array.from(indices).some(index => !Number.isInteger(index) || !details.codes[index])) {
      throw new Error("Die Auswahl muss eine Teilmenge von U ohne doppelte Codes sein.");
    }
  }

  function filterSet(details, indices, entries, keep, helpers) {
    validateIndices(details, indices);
    if (!Array.isArray(entries) || typeof keep !== "boolean") throw new Error("Wähle eine Score-Filterbedingung und Behalten oder Ausschliessen.");
    for (const entry of entries) helpers.validateFeedback(entry.feedback, details.codes[0].length);
    return indices.filter(index => {
      const compatible = entries.every(entry => {
        const score = helpers.scoreGuess(details.codes[index], entry.guess);
        return score.black === entry.feedback.black && score.white === entry.feedback.white;
      });
      return keep ? compatible : !compatible;
    });
  }

  function checkSet(details, indices) {
    validateIndices(details, indices);
    const actual = new Set(indices);
    const expected = new Set(details.possibleIndices);
    const missing = details.possibleIndices.filter(index => !actual.has(index));
    const extra = indices.filter(index => !expected.has(index));
    const correct = !missing.length && !extra.length;
    return {
      correct, missing, extra,
      message: correct
        ? `S ist korrekt: ${indices.length}/${details.codes.length} Codes sind mit allen bisherigen Guesses und Scores kompatibel.`
        : `S ist noch nicht korrekt: ${extra.length} inkompatible Codes sind enthalten; ${missing.length} kompatible Codes fehlen.`
    };
  }

  function partitionCodes(details, index, helpers, indices = details.possibleIndices) {
    validateIndices(details, indices);
    if (!details.codes[index]) throw new Error("Dieser Testguess liegt nicht in U.");
    const groups = new Map();
    for (const candidate of indices) {
      const score = helpers.scoreGuess(details.codes[candidate], details.codes[index]);
      const key = `${score.black},${score.white}`;
      if (!groups.has(key)) groups.set(key, { key, ...score, indices: [] });
      groups.get(key).indices.push(candidate);
    }
    return [...groups.values()].sort((a, b) => a.black - b.black || a.white - b.white)
      .map(group => ({ ...group, count: group.indices.length }));
  }

  function checkWorst(groups, key) {
    const selected = groups.find(group => group.key === key);
    if (!selected) throw new Error("Diese Score-Gruppe existiert nicht.");
    const worst = Math.max(...groups.map(group => group.count));
    return {
      correct: selected.count === worst,
      message: selected.count === worst
        ? `Richtig: Score (${selected.black}, ${selected.white}) lässt maximal ${worst} Codes in S. minel = |S| − ${worst}.`
        : `Diese Gruppe enthält ${selected.count} Codes; die grösste enthält ${worst}. Die grösste Gruppe bestimmt minel.`
    };
  }

  function checkChoice(details, index) {
    const selected = details.ranking.find(entry => entry.index === index);
    const recommended = details.ranking.find(entry => entry.index === details.recommendedIndex);
    if (!selected || !recommended) throw new Error("Dieser Code ist kein noch unbenutzter Testguess aus G.");
    if (index === details.recommendedIndex) return {
      correct: true,
      message: `Richtig: Guess ${details.codes[index].join("")} entfernt mindestens ${selected.minel} Codes aus S.`
    };
    let reason;
    if (selected.minel < recommended.minel) {
      reason = `minel ist hier ${selected.minel}; ein anderer Testguess erreicht ${recommended.minel}. Wähle den grössten Wert in „minel“.`;
    } else if (!selected.possible && recommended.possible) {
      reason = "minel ist gleich gut. Bevorzuge dann einen Code, der selbst noch in S liegt.";
    } else {
      reason = details.opening
        ? "Im Standardspiel beginnt Knuth mit Guess 1122."
        : "Bei gleichem minel und gleicher Zugehörigkeit zu S wählen wir den kleinsten Code.";
    }
    return { correct: false, message: `Noch nicht Knuths Auswahl. ${reason}` };
  }

  function sortIndices(details, indices, order, scores = []) {
    validateIndices(details, indices);
    if (!["code-asc", "code-desc", "score", "minimax"].includes(order)) throw new Error("Diese Sortierung ist nicht verfügbar.");
    if (order === "score" && indices.some(index => !scores[index])) throw new Error("Für diese Sortierung fehlt ein Guess.");
    const ranking = new Map(details.ranking.map(entry => [entry.index, entry]));
    const base = details.codes[0].length + 1;
    return [...indices].sort((a, b) => {
      if (order === "code-desc") return b - a;
      if (order === "score") return (scores[a].black - scores[b].black) * base + scores[a].white - scores[b].white || a - b;
      if (order === "minimax") {
        const first = ranking.get(a);
        const second = ranking.get(b);
        if (!first || !second) return Number(Boolean(second)) - Number(Boolean(first)) || a - b;
        return second.minel - first.minel || Number(second.possible) - Number(first.possible) || a - b;
      }
      return a - b;
    });
  }

  function sortTable(details, column, direction, s, g, minels, scores) {
    if (!["code", "s", "g", "score", "minel"].includes(column) || !["asc", "desc"].includes(direction)) throw new Error("Diese Sortierung ist nicht verfügbar.");
    const sign = direction === "asc" ? 1 : -1;
    const value = index => column === "code" ? index : column === "s" ? Number(s.has(index)) : column === "g" ? Number(g.has(index))
      : column === "minel" ? minels.get(index) : scores[index] ? scores[index].black * (details.codes[0].length + 1) + scores[index].white : undefined;
    return details.codes.map((_, index) => index).sort((a, b) => {
      const first = value(a);
      const second = value(b);
      if (first === undefined || second === undefined) return Number(first === undefined) - Number(second === undefined) || a - b;
      return sign * (first - second) || (column === "minel" ? Number(s.has(b)) - Number(s.has(a)) : 0) || a - b;
    });
  }

  function createLesson(details) {
    const all = details.codes.map((_, index) => index);
    const usedBefore = new Set(details.history.slice(0, -1).map(entry => entry.guess.join("")));
    const lastIndex = details.lastEntry ? details.codes.findIndex(code => code.join("") === details.lastEntry.guess.join("")) : null;
    const s = new Set(details.beforeIndices);
    const g = new Set(all.filter(index => !usedBefore.has(details.codes[index].join(""))));
    const expected = new Set(details.possibleIndices);
    const ranking = new Map(details.ranking.map(entry => [entry.index, entry]));
    const removedS = new Set();
    const removedG = new Set();
    const minels = new Map();
    let step = 1;
    let choice = null;
    let warning = "";

    function advance() {
      if (step === 1 && (lastIndex === null || !g.has(lastIndex))) step = 2;
      if (step === 2 && [...s].every(index => expected.has(index))) step = 3;
      if (step === 3 && (details.recommendedIndex === null || minels.size === g.size)) step = 4;
      if (step === 4 && (details.recommendedIndex === null || choice !== null)) step = 5;
    }

    function membership(set, index, checked) {
      if (!Number.isInteger(index) || !details.codes[index]) throw new Error("Dieser Code liegt nicht in U.");
      if (typeof checked !== "boolean") throw new Error("Wähle eine Tickbox in S oder G ab.");
      if (set === "g") {
        if (step !== 1) throw new Error("Die Zuordnung zu G ist für diesen Schritt bereits erledigt.");
        if (checked || index !== lastIndex) throw new Error(`Entferne nur den letzten Guess ${details.codes[lastIndex].join("")} aus G. Andere Codes bleiben als Testguesses verfügbar.`);
        g.delete(index);
        removedG.add(index);
      } else if (set === "s") {
        if (step !== 2) throw new Error("Bearbeite S erst in Schritt 2.");
        if (checked || !s.has(index)) throw new Error("Entferne nur noch enthaltene, inkompatible Codes aus S.");
        if (expected.has(index)) throw new Error(`Code ${details.codes[index].join("")} passt zum letzten Guess/Score-Paar und bleibt in S. Vergleiche seinen Score in der Tabelle mit dem Score oben.`);
        s.delete(index);
        removedS.add(index);
      } else throw new Error("Wähle die Spalte S oder G.");
      advance();
    }

    function setMinel(index, value) {
      if (step !== 3) throw new Error("Berechne minel erst nach dem Ausschliessen aus G und S.");
      const entry = ranking.get(index);
      if (!g.has(index) || !entry) throw new Error("Berechne minel nur für noch unbenutzte Testguesses in G.");
      if (!Number.isInteger(value) || value !== entry.minel) {
        throw new Error(`minel für Testguess ${details.codes[index].join("")} ist noch nicht korrekt. Zähle ${s.size} Codes in S minus die Anzahl in der grössten Score-Gruppe.`);
      }
      minels.set(index, value);
      advance();
    }

    function choose(index) {
      if (step !== 4 && step !== 5) throw new Error("Erledige zuerst die Schritte 1 bis 3.");
      if (!Number.isInteger(index) || !details.codes[index]) throw new Error("Dieser Guess ist kein gültiger Code aus U.");
      const result = g.has(index) ? checkChoice(details, index) : { correct: false, message: "Dieser Guess wurde bereits gespielt; er bringt keinen neuen Score." };
      warning = result.correct ? "" : `${result.message} Du kannst ihn trotzdem übernehmen; Knuths Garantie gilt dann nicht.`;
      choice = index;
      advance();
      return warning || result.message;
    }

    function automatic() {
      const current = step;
      if (step === 1) membership("g", lastIndex, false);
      else if (step === 2) {
        for (const index of [...s]) if (!expected.has(index)) membership("s", index, false);
      } else if (step === 3) {
        for (const index of g) {
          const entry = ranking.get(index);
          if (!entry) throw new Error("Für einen Testguess fehlen die Minimax-Daten. Berechne die Analyse erneut.");
          minels.set(index, entry.minel);
        }
        advance();
      } else if (step === 4) choose(details.recommendedIndex);
      else throw new Error("Alle Schritte sind bereits erledigt.");
      return current;
    }

    advance();
    return { s, g, removedS, removedG, minels, lastIndex, membership, setMinel, choose, automatic,
      get step() { return step; }, get choice() { return choice; }, get warning() { return warning; } };
  }

  function createView({ peg, applyGuess, notify }) {
    const byId = id => document.getElementById(id);
    const panel = byId("algorithm-panel");
    let config;
    let mode = "breaker";
    let history = [];
    let canApply = false;
    let data = null;
    let lesson = null;
    let interactive = false;
    let scores = [];
    let sortColumn = "code";
    let sortDirection = "asc";
    let searchIndex = null;
    let worker = null;
    let timeout = null;
    let serial = 0;
    let tooltipIndex = null;
    const scoreText = score => `(${score.black}, ${score.white})`;
    const titles = ["Letzten Guess aus G ausschliessen", "Inkompatible Codes aus S ausschliessen", "minel für alle Testguesses aus G berechnen", "Nächsten Guess wählen"];

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    }

    function message(id, text, error = false) {
      byId(id).textContent = text;
      byId(id).classList.toggle("error", error);
    }

    function hideGroups() {
      byId("minel-groups").hidden = true;
      tooltipIndex = null;
    }

    function close() {
      panel.close();
      byId("algorithm-help").open = false;
      document.body.classList.remove("explorer-open");
      hideGroups();
    }

    function stop() {
      if (worker) worker.terminate();
      worker = null;
      clearTimeout(timeout);
      serial++;
    }

    function loading() {
      data = null;
      lesson = null;
      hideGroups();
      byId("explorer-content").hidden = true;
      byId("explorer-retry").hidden = true;
      panel.setAttribute("aria-busy", "true");
      message("explorer-status", "Die vollständige Codeliste und die Minimax-Werte werden berechnet …");
    }

    function fail(text) {
      panel.setAttribute("aria-busy", "false");
      byId("explorer-content").hidden = true;
      byId("explorer-retry").hidden = mode !== "breaker";
      message("explorer-status", text, true);
    }

    function request() {
      if (mode !== "breaker" || !panel.open) return;
      loading();
      const requestId = ++serial;
      const initial = !worker;
      try {
        if (initial) {
          const current = root.MastermindSolver.createWorker(root.Mastermind);
          worker = current;
          current.onmessage = event => {
            if (worker !== current || event.data.requestId !== serial) return;
            clearTimeout(timeout);
            if (event.data.error) fail(event.data.error);
            else setData(event.data.result.details);
          };
          current.onerror = event => {
            event.preventDefault();
            if (worker !== current) return;
            stop();
            fail("Die Analyse konnte nicht ausgeführt werden. Berechne sie erneut.");
          };
          current.onmessageerror = () => {
            if (worker !== current) return;
            stop();
            fail("Die Analyse-Antwort konnte nicht gelesen werden. Berechne sie erneut.");
          };
        }
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (requestId !== serial) return;
          stop();
          fail("Die Analyse hat zu lange gedauert. Berechne sie erneut.");
        }, 30000);
        worker.postMessage({ ...(initial ? { config } : {}), history, details: true, requestId });
      } catch (error) {
        stop();
        fail(error.message);
      }
    }

    function renderPair() {
      const last = history[history.length - 1];
      const guess = last ? last.guess : mode === "maker" && data && data.recommendedIndex !== null ? data.codes[data.recommendedIndex] : null;
      const code = node("div", undefined, "peg-row");
      if (guess) code.append(...guess.map(color => peg(color)));
      else code.textContent = "Noch kein Guess";
      code.setAttribute("aria-label", guess ? `Guess ${guess.join("")}` : "Noch kein Guess");
      const label = node("div", last ? `Ausgewerteter Guess ${history.length}` : mode === "maker" && guess ? "Erster Guess des Computers" : "Vor dem ersten Guess");
      label.append(code);
      const score = node("div", "Score · (schwarz, weiss)");
      score.append(node("strong", last ? scoreText(last.feedback) : guess ? "Noch ausstehend" : "—"));
      byId("current-pair").replaceChildren(label, score);
    }

    function reset(settings, nextMode, entries, allowApply) {
      stop();
      close();
      config = settings;
      mode = nextMode;
      history = entries;
      canApply = allowApply;
      data = null;
      lesson = null;
      byId("algorithm-title").textContent = mode === "maker" ? "Knuth-Explorer · Computer / Codebreaker" : "Knuth-Explorer · Mensch / Codebreaker";
      message("explorer-intro", mode === "maker"
        ? "Lege zuerst deinen Code fest. Danach siehst du hier die automatisch erledigten Schritte des Computers."
        : "Vier Schritte mit einer Codeliste. Jeder Schritt kann manuell oder automatisch erledigt werden.");
      message("explorer-status", "");
      panel.setAttribute("aria-busy", "false");
      byId("explorer-content").hidden = true;
      byId("explorer-retry").hidden = true;
      renderPair();
    }

    function updateBreaker(entries, allowApply) {
      if (mode !== "breaker") return;
      history = entries;
      canApply = allowApply;
      data = null;
      lesson = null;
      byId("explorer-content").hidden = true;
      renderPair();
      if (panel.open) request();
    }

    function setData(details) {
      data = details;
      history = data.history;
      interactive = mode === "breaker" && canApply && data.recommendedIndex !== null;
      lesson = createLesson(data);
      if (!interactive) while (lesson.step < 5) lesson.automatic();
      scores = data.lastEntry ? data.codes.map(code => root.Mastermind.scoreGuess(code, data.lastEntry.guess)) : [];
      sortColumn = "code";
      sortDirection = "asc";
      searchIndex = null;
      byId("code-search").value = "";
      byId("next-guess-code").value = lesson.choice === null ? "" : data.codes[lesson.choice].join("");
      byId("next-guess-code").placeholder = config.repetitions ? "1".repeat(config.positions) : Array.from({ length: config.positions }, (_, index) => index + 1).join("");
      byId("next-guess-code").removeAttribute("aria-invalid");
      message("lesson-message", lesson.warning, Boolean(lesson.warning));
      message("explorer-status", "");
      message("explorer-intro", interactive
        ? "Arbeite den hervorgehobenen Schritt ab. G enthält auch Codes ausserhalb S: Exaktes Knuth vergleicht alle noch unbenutzten Testguesses."
        : data.recommendedIndex === null
          ? "Der Code ist gefunden. Die Mengen sind aktualisiert; minel und ein weiterer Guess werden nicht mehr benötigt."
          : `${mode === "breaker" && !canApply ? "Das Spiel ist beendet; diese Berechnung ist nur eine Erklärung. " : ""}Alle vier Schritte sind automatisch erledigt. ${mode === "maker" ? "Neuer Guess des Computers" : "Knuths nächster Vorschlag"}: ${data.codes[data.recommendedIndex].join("")}.`);
      panel.setAttribute("aria-busy", "false");
      byId("explorer-content").hidden = false;
      byId("explorer-retry").hidden = true;
      renderPair();
      render();
    }

    function renderLegend() {
      const definitions = [
        ["U", data.codes.length, "Alle zulässigen Codes."],
        ["S", lesson.s.size, "Codes, die mit den bisherigen Guesses und Scores kompatibel sind."],
        ["G", lesson.g.size, "Noch unbenutzte Testguesses aus U; auch ausserhalb S."]
      ];
      byId("set-legend").replaceChildren(...definitions.map(([name, size, description]) => {
        const entry = node("div");
        entry.append(node("dt", `${name} · ${size}/${data.codes.length}`), node("dd", description));
        return entry;
      }));
      byId("set-legend").querySelectorAll("dd")[1].textContent += lesson.step <= 2 ? " Schritt 2 aktualisiert diese Arbeitsmenge." : "";
      byId("set-legend").querySelectorAll("dd")[2].textContent += lesson.step === 1 ? " Schritt 1 aktualisiert diese Arbeitsmenge." : "";
    }

    function renderSteps() {
      const summaries = [
        !data.lastEntry ? "Kein vorheriger Guess" : lesson.removedG.size ? "Letzter Guess entfernt" : "Bereits früher entfernt",
        `${lesson.removedS.size} Codes jetzt ausgeschlossen`,
        data.recommendedIndex === null ? "Nicht mehr nötig" : `${lesson.minels.size}/${lesson.g.size} minel-Werte`,
        lesson.choice === null ? data.recommendedIndex === null ? "Kein weiterer Guess" : "Noch offen" : `Guess ${data.codes[lesson.choice].join("")}`
      ];
      byId("explorer-steps").replaceChildren(...titles.map((title, index) => {
        const number = index + 1;
        const item = node("li", undefined, lesson.step === number ? "active" : lesson.step > number ? "done" : "");
        item.append(node("strong", `${number}. ${title}`), node("small", lesson.step > number || number === 3 && lesson.step === 3 ? summaries[index] : "Noch offen"));
        if (lesson.step === number) item.setAttribute("aria-current", "step");
        return item;
      }));
      const instructions = [
        `Wähle in der Spalte G die Tickbox von Guess ${data.lastEntry ? data.lastEntry.guess.join("") : ""} ab. Dieser Guess wurde bereits gespielt und ist kein neuer Testguess mehr.`,
        `Wähle in S alle Codes ab, deren Score in der Tabelle nicht ${data.lastEntry ? scoreText(data.lastEntry.feedback) : ""} ist. Noch ${[...lesson.s].filter(index => !data.possibleIndices.includes(index)).length} inkompatible Codes entfernen. Richtige Codes bleiben in S.`,
        `Jede Zeile in G ist ein Testguess. Hover oder Tastaturfokus auf sein minel-Feld zeigt die Score-Gruppen für alle ${lesson.s.size} Codes in S. minel = |S| − Anzahl in der grössten Gruppe. Trage den Wert ein und bestätige mit Enter oder verlasse das Feld. Auch Testguesses ausserhalb S gehören dazu.`,
        "Lies den grössten minel-Wert aus der Tabelle ab und gib den Code als nächsten Guess ein. Bei Gleichstand: Code in S bevorzugen, dann kleinster Code. Im Standardspiel beginnt Knuth mit 1122."
      ];
      message("lesson-title", lesson.step <= 4 ? `${lesson.step}. ${titles[lesson.step - 1]}` : interactive ? "Alle Schritte erledigt" : "Automatisch erledigt");
      message("lesson-instruction", lesson.step <= 4 ? instructions[lesson.step - 1]
        : data.recommendedIndex === null ? "Der letzte Score bestätigt den Code. Die aktualisierten Mengen siehst du unten."
          : interactive ? "Übernimm den gewählten Guess ins Spielbrett; dort gibst du ihn ab."
            : "Die Tabelle zeigt alle Ausschlüsse und minel-Werte dieser Berechnung. Hover oder Fokus auf minel erklärt jeweils die Score-Gruppen.");
      byId("automatic-step").hidden = !interactive || lesson.step > 4;
      byId("automatic-step").textContent = lesson.step === 3 ? "Alle minel-Werte automatisch ausfüllen" : "Automatisch erledigen";
      byId("next-guess-form").hidden = lesson.step < 4 || data.recommendedIndex === null;
      byId("next-guess-code").readOnly = !interactive;
      byId("check-next-guess").hidden = !interactive;
      byId("apply-guess").hidden = !interactive || lesson.step !== 5;
      if (lesson.choice !== null) byId("next-guess-code").value = data.codes[lesson.choice].join("");
    }

    function renderRow(index) {
      const row = node("tr");
      row.dataset.index = String(index);
      row.className = lesson.s.has(index) ? "in-s" : lesson.removedS.has(index) ? "excluded-now" : "excluded-before";
      if (searchIndex === index) row.classList.add("search-hit");
      const code = node("td");
      const pegs = node("div", undefined, "peg-row");
      pegs.setAttribute("aria-label", `Code ${data.codes[index].join("")}`);
      pegs.append(...data.codes[index].map(color => peg(color)));
      code.append(pegs);
      row.append(code);
      for (const set of ["s", "g"]) {
        const cell = node("td");
        const input = node("input");
        input.type = "checkbox";
        input.dataset.index = String(index);
        input.dataset.set = set;
        input.checked = lesson[set].has(index);
        input.disabled = !interactive || lesson.step !== (set === "g" ? 1 : 2) || !input.checked;
        input.setAttribute("aria-label", `Code ${data.codes[index].join("")} in ${set.toUpperCase()}`);
        if (set === "g" && lesson.removedG.has(index)) {
          cell.className = "guess-excluded";
          input.setAttribute("aria-label", `Code ${data.codes[index].join("")} jetzt aus G ausgeschlossen`);
        }
        cell.append(input);
        row.append(cell);
      }
      row.append(node("td", scores[index] ? scoreText(scores[index]) : "—"));
      const minel = node("td", undefined, "minel-cell");
      if (lesson.g.has(index) && data.recommendedIndex !== null) {
        const input = node("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.dataset.index = String(index);
        input.dataset.minel = "true";
        input.value = lesson.minels.has(index) ? String(lesson.minels.get(index)) : "";
        input.placeholder = lesson.step < 3 ? "—" : "?";
        input.readOnly = !interactive || lesson.step !== 3 || lesson.minels.has(index);
        input.classList.toggle("minel-correct", lesson.minels.has(index));
        input.setAttribute("aria-label", `minel für Testguess ${data.codes[index].join("")}`);
        input.setAttribute("aria-describedby", "minel-groups");
        minel.dataset.index = String(index);
        minel.append(input);
      } else minel.textContent = "—";
      row.append(minel);
      return row;
    }

    function renderList() {
      hideGroups();
      const indices = sortTable(data, sortColumn, sortDirection, lesson.s, lesson.g, lesson.minels, scores);
      byId("code-rows").replaceChildren(...indices.map(renderRow));
      for (const th of panel.querySelectorAll("th[data-column]")) {
        th.setAttribute("aria-sort", th.dataset.column === sortColumn ? sortDirection === "asc" ? "ascending" : "descending" : "none");
        for (const button of th.querySelectorAll("button[data-direction]")) button.setAttribute("aria-pressed", String(th.dataset.column === sortColumn && button.dataset.direction === sortDirection));
      }
    }

    function render() {
      renderSteps();
      renderLegend();
      renderList();
    }

    function updateAfterAction(input, index, previousStep) {
      hideGroups();
      if (lesson.step !== previousStep) render();
      else {
        renderSteps();
        renderLegend();
        if (input.dataset.minel && sortColumn !== "minel") {
          input.value = String(lesson.minels.get(index));
          input.readOnly = true;
          input.classList.add("minel-correct");
          input.removeAttribute("aria-invalid");
        } else if (sortColumn !== "code") renderList();
        else {
          const row = byId("code-rows").querySelector(`tr[data-index="${index}"]`);
          if (row) row.replaceWith(renderRow(index));
        }
      }
    }

    function showGroups(cell, reposition = false) {
      if (!data || !lesson || lesson.step < 3 || !cell) return;
      const index = Number(cell.dataset.index);
      if (!lesson.g.has(index) || data.recommendedIndex === null) return;
      if (!reposition && tooltipIndex === index && !byId("minel-groups").hidden) return;
      const groups = partitionCodes(data, index, root.Mastermind, [...lesson.s]);
      const largest = Math.max(...groups.map(group => group.count));
      const content = byId("minel-groups");
      content.replaceChildren(node("strong", `Testguess ${data.codes[index].join("")} · |S| = ${lesson.s.size}`),
        node("p", "Gleiche Scores bilden eine Gruppe. Die grösste ist orange."));
      for (const group of groups) {
        const part = node("div", undefined, `score-part${group.count === largest ? " largest" : ""}`);
        const track = node("span", undefined, "bar-track");
        const bar = node("span", undefined, "bar");
        bar.style.width = `${group.count / largest * 100}%`;
        track.append(bar);
        part.append(node("span", scoreText(group)), track, node("strong", String(group.count)));
        content.append(part);
      }
      content.hidden = false;
      tooltipIndex = index;
      const anchor = cell.getBoundingClientRect();
      const width = content.offsetWidth;
      const height = content.offsetHeight;
      const left = Math.max(12, Math.min(anchor.left - width - 8, document.documentElement.clientWidth - width - 12));
      const top = Math.max(12, Math.min(anchor.top, document.documentElement.clientHeight - height - 12));
      content.style.left = `${left}px`;
      content.style.top = `${top}px`;
    }

    function scrollGroups() {
      if (tooltipIndex === null) return;
      const cell = byId("code-rows").querySelector(`.minel-cell[data-index="${tooltipIndex}"]`);
      if (!cell) { hideGroups(); return; }
      const rect = cell.getBoundingClientRect();
      const table = byId("code-rows").closest(".code-table-scroll").getBoundingClientRect();
      if (rect.bottom < Math.max(0, table.top) || rect.top > Math.min(document.documentElement.clientHeight, table.bottom)) hideGroups();
      else showGroups(cell, true);
    }

    function open() {
      if (!panel.open) panel.showModal();
      document.body.classList.add("explorer-open");
      if (mode === "breaker" && !data) request();
    }

    byId("show-explorer").addEventListener("click", open);
    byId("close-explorer").addEventListener("click", close);
    const help = byId("algorithm-help");
    help.addEventListener("mouseenter", () => { help.open = true; });
    help.addEventListener("focusin", () => { help.open = true; });
    help.addEventListener("mouseleave", () => { if (!help.matches(":focus-within")) help.open = false; });
    help.addEventListener("focusout", () => { if (!help.matches(":hover")) help.open = false; });
    help.querySelector("summary").addEventListener("click", event => { event.preventDefault(); help.open = true; });
    document.addEventListener("keydown", event => {
      if (!event.defaultPrevented && panel.open && event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    panel.addEventListener("close", () => {
      document.body.classList.remove("explorer-open");
      hideGroups();
    });
    panel.addEventListener("click", event => {
      if (event.target !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    panel.addEventListener("scroll", scrollGroups);
    byId("explorer-retry").addEventListener("click", request);
    byId("automatic-step").addEventListener("click", () => {
      try {
        const previousStep = lesson.automatic();
        render();
        message("lesson-message", `Schritt ${previousStep} automatisch erledigt.${lesson.step <= 4 ? ` Weiter mit Schritt ${lesson.step}.` : " Der nächste Guess ist geprüft."}`);
        if (lesson.step === 5 && interactive) byId("apply-guess").focus();
        if (previousStep === 1 || previousStep === 2) {
          const index = previousStep === 1 ? lesson.lastIndex : [...lesson.removedS][0];
          renderList();
          const row = byId("code-rows").querySelector(`tr[data-index="${index}"]`);
          if (row) row.scrollIntoView({ block: "nearest" });
        }
      } catch (error) { message("lesson-message", error.message, true); }
    });
    byId("code-rows").addEventListener("change", event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const index = Number(input.dataset.index);
      const previousStep = lesson.step;
      try {
        if (input.dataset.set) lesson.membership(input.dataset.set, index, input.checked);
        else if (input.dataset.minel) {
          if (input.readOnly) return;
          if (!/^\d+$/.test(input.value)) throw new Error("Trage eine ganze Zahl für minel ein.");
          lesson.setMinel(index, Number(input.value));
        } else return;
        updateAfterAction(input, index, previousStep);
        message("lesson-message", "");
      } catch (error) {
        if (input.dataset.set) input.checked = lesson[input.dataset.set].has(index);
        else if (input.dataset.minel) input.value = "";
        hideGroups();
        notify(error.message, input);
      }
    });
    byId("code-rows").addEventListener("input", event => {
      if (event.target instanceof HTMLInputElement) event.target.removeAttribute("aria-invalid");
    });
    byId("code-rows").addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.dataset.minel && !event.target.readOnly) {
        event.preventDefault();
        event.target.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    byId("code-rows").addEventListener("mouseover", event => showGroups(event.target.closest(".minel-cell")));
    byId("code-rows").addEventListener("focusin", event => showGroups(event.target.closest(".minel-cell")));
    byId("code-rows").addEventListener("mouseout", event => {
      if (event.relatedTarget instanceof Node && (byId("minel-groups").contains(event.relatedTarget) || event.target.closest(".minel-cell")?.contains(event.relatedTarget))) return;
      hideGroups();
    });
    byId("code-rows").addEventListener("focusout", hideGroups);
    byId("minel-groups").addEventListener("mouseleave", hideGroups);
    byId("code-rows").closest(".code-table-scroll").addEventListener("scroll", scrollGroups);
    for (const th of panel.querySelectorAll("th[data-column]")) {
      for (const direction of ["asc", "desc"]) {
        const button = node("button", direction === "asc" ? "\u25b2" : "\u25bc");
        button.type = "button";
        button.dataset.direction = direction;
        button.setAttribute("aria-label", `${th.dataset.column === "s" || th.dataset.column === "g" ? `in ${th.dataset.column.toUpperCase()}` : th.dataset.column === "code" ? "Code" : th.dataset.column === "score" ? "Score" : "minel"} ${direction === "asc" ? "aufsteigend" : "absteigend"} sortieren`);
        button.addEventListener("click", () => { sortColumn = th.dataset.column; sortDirection = direction; renderList(); });
        th.querySelector(".sort-controls").append(button);
      }
    }
    byId("code-search-form").addEventListener("submit", event => {
      event.preventDefault();
      try {
        const input = byId("code-search").value.replace(/[\s,]/g, "");
        if (!/^\d+$/.test(input) || input.length !== config.positions) throw new Error(`Gib genau ${config.positions} Farbnummern ein.`);
        root.Mastermind.validateCode([...input].map(Number), config);
        searchIndex = data.codes.findIndex(code => code.join("") === input);
        renderList();
        const row = byId("code-rows").querySelector(`tr[data-index="${searchIndex}"]`);
        const frame = row.closest(".code-table-scroll");
        frame.scrollTop += row.getBoundingClientRect().top - frame.getBoundingClientRect().top - frame.clientHeight / 2;
      } catch (error) { notify(error.message, byId("code-search")); }
    });
    byId("next-guess-form").addEventListener("submit", event => {
      event.preventDefault();
      try {
        const input = byId("next-guess-code").value.replace(/[\s,]/g, "");
        if (!/^\d+$/.test(input) || input.length !== config.positions) throw new Error(`Gib genau ${config.positions} Farbnummern als Guess ein.`);
        root.Mastermind.validateCode([...input].map(Number), config);
        const index = data.codes.findIndex(code => code.join("") === input);
        const result = lesson.choose(index);
        byId("next-guess-code").removeAttribute("aria-invalid");
        render();
        message("lesson-message", result, Boolean(lesson.warning));
        byId("apply-guess").focus();
      } catch (error) {
        byId("next-guess-code").setAttribute("aria-invalid", "true");
        message("lesson-message", error.message, true);
      }
    });
    byId("next-guess-code").addEventListener("input", () => { byId("apply-guess").hidden = true; });
    byId("apply-guess").addEventListener("click", () => {
      try {
        if (!interactive || lesson.step !== 5 || lesson.choice === null) throw new Error("Erledige zuerst alle vier Schritte.");
        close();
        applyGuess([...data.codes[lesson.choice]]);
      } catch (error) {
        open();
        message("lesson-message", error.message, true);
      }
    });
    return { reset, updateBreaker, setMaker: setData, loading, fail, stop };
  }

  const api = Object.freeze({ filterSet, checkSet, partitionCodes, checkWorst, checkChoice, sortIndices, sortTable, createLesson, createView });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MastermindExplorer = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
