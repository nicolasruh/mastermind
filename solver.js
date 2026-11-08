(function (root) {
  "use strict";

  // The factory also runs in a Blob worker so opening index.html needs no server.
  function createSolver(config, helpers) {
    helpers.validateConfig(config);
    const settings = Object.freeze({ ...config });
    const codes = [];
    function generate(prefix) {
      if (prefix.length === settings.positions) {
        codes.push(Object.freeze(prefix));
        return;
      }
      for (let color = 1; color <= settings.colors; color++) {
        if (settings.repetitions || !prefix.includes(color)) generate([...prefix, color]);
      }
    }
    generate([]);
    Object.freeze(codes);
    const size = codes.length;
    const base = settings.positions + 1;
    const matrix = new Uint8Array(size * size);
    const lookup = new Map(codes.map((code, index) => [code.join(","), index]));
    for (let first = 0; first < size; first++) {
      for (let second = first; second < size; second++) {
        const { black, white } = helpers.scoreGuess(codes[first], codes[second]);
        matrix[first * size + second] = matrix[second * size + first] = black * base + white;
      }
    }
    const allIndices = Object.freeze(codes.map((_, index) => index));

    function indexOf(guess) {
      helpers.validateCode(guess, settings);
      return lookup.get(guess.join(","));
    }

    function filter(possible, guess, feedback) {
      helpers.validateFeedback(feedback, settings.positions);
      const offset = indexOf(guess) * size;
      const score = feedback.black * base + feedback.white;
      return possible.filter(index => matrix[offset + index] === score);
    }

    function choose(possible, used = []) {
      if (!possible.length) throw new Error("S enthält keine kompatiblen Codes mehr. Korrigiere den Score.");
      if (possible.length === 1) return [...codes[possible[0]]];
      if (!used.length && possible.length === size && settings.positions === 4 &&
          settings.colors === 6 && settings.repetitions) return [1, 1, 2, 2];
      const usedIndices = new Set(used.map(indexOf));
      const possibleSet = new Set(possible);
      const buckets = new Uint16Array(base * base);
      let bestIndex = -1;
      let bestWorst = Infinity;
      for (let guess = 0; guess < size; guess++) {
        if (usedIndices.has(guess)) continue;
        buckets.fill(0);
        let worst = 0;
        for (const candidate of possible) {
          const count = ++buckets[matrix[guess * size + candidate]];
          if (count > worst) worst = count;
          if (worst > bestWorst) break;
        }
        if (worst < bestWorst || (worst === bestWorst && possibleSet.has(guess) && !possibleSet.has(bestIndex))) {
          bestIndex = guess;
          bestWorst = worst;
        }
      }
      if (bestIndex === -1) throw new Error("G enthält keinen unbenutzten Testguess.");
      return [...codes[bestIndex]];
    }

    function partition(possible, guess) {
      const offset = indexOf(guess) * size;
      const groups = new Map();
      for (const index of possible) {
        const score = matrix[offset + index];
        if (!groups.has(score)) groups.set(score, {
          black: Math.floor(score / base), white: score % base, indices: []
        });
        groups.get(score).indices.push(index);
      }
      return [...groups.values()].sort((a, b) => a.black - b.black || a.white - b.white)
        .map(group => ({ ...group, count: group.indices.length }));
    }

    function rank(possible, used) {
      const usedIndices = new Set(used.map(indexOf));
      const possibleSet = new Set(possible);
      const buckets = new Uint16Array(base * base);
      const ranking = [];
      for (let index = 0; index < size; index++) {
        if (usedIndices.has(index)) continue;
        buckets.fill(0);
        let worst = 0;
        for (const candidate of possible) {
          worst = Math.max(worst, ++buckets[matrix[index * size + candidate]]);
        }
        ranking.push({ index, worst, minel: possible.length - worst, possible: possibleSet.has(index) });
      }
      return ranking.sort((a, b) => a.worst - b.worst || Number(b.possible) - Number(a.possible) || a.index - b.index);
    }

    function analyze(history, includeDetails = false) {
      let possible = [...allIndices];
      let before = possible;
      for (const entry of history) {
        before = possible;
        possible = filter(possible, entry.guess, entry.feedback);
        if (!possible.length) {
          throw new Error("Dieser Score widerspricht den bisherigen Guesses und Scores. Prüfe Schwarz und Weiss oder korrigiere einen früheren Score.");
        }
      }
      const solved = history.length > 0 && history[history.length - 1].feedback.black === settings.positions;
      const result = {
        count: possible.length,
        guess: solved ? null : choose(possible, history.map(entry => entry.guess))
      };
      if (includeDetails) {
        result.details = {
          codes,
          history: history.map(entry => ({ guess: [...entry.guess], feedback: { ...entry.feedback } })),
          beforeIndices: [...before],
          possibleIndices: [...possible],
          lastEntry: history.length ? history[history.length - 1] : null,
          ranking: solved ? [] : rank(possible, history.map(entry => entry.guess)),
          recommendedIndex: solved ? null : indexOf(result.guess),
          opening: !history.length && settings.positions === 4 && settings.colors === 6 && settings.repetitions
        };
      }
      return result;
    }

    return { codes, allIndices, filter, choose, partition, analyze };
  }

  function workerMain(createSolver, helpers) {
    let solver;
    self.onmessage = event => {
      try {
        if (event.data.config) solver = createSolver(event.data.config, helpers);
        if (!solver) throw new Error("Der Solver wurde noch nicht gestartet.");
        self.postMessage({ requestId: event.data.requestId, result: solver.analyze(event.data.history, event.data.details === true) });
      } catch (error) {
        self.postMessage({ requestId: event.data.requestId, error: error.message });
      }
    };
  }

  function createWorker(helpers) {
    const source = `const validateConfig = ${helpers.validateConfig.toString()};
      const validateCode = ${helpers.validateCode.toString()};
      const validateFeedback = ${helpers.validateFeedback.toString()};
      const scoreGuess = ${helpers.scoreGuess.toString()};
      (${workerMain.toString()})(${createSolver.toString()},
        { validateConfig, validateCode, validateFeedback, scoreGuess });`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      return new Worker(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const api = Object.freeze({ createSolver, createWorker });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MastermindSolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
