(function (root) {
  "use strict";

  const MAX_ATTEMPTS = 8;

  function validateConfig(config) {
    if (!config || !Number.isInteger(config.positions) || config.positions < 2 || config.positions > 4 ||
        !Number.isInteger(config.colors) || config.colors < 2 || config.colors > 6 ||
        typeof config.repetitions !== "boolean") {
      throw new Error("Wähle 2–4 Positionen und 2–6 Farben.");
    }
    if (!config.repetitions && config.colors < config.positions) {
      throw new Error("Ohne Wiederholungen brauchst du mindestens so viele Farben wie Positionen.");
    }
  }

  function validateCode(code, config) {
    validateConfig(config);
    if (!Array.isArray(code) || code.length !== config.positions ||
        Array.from(code).some(color => !Number.isInteger(color) || color < 1 || color > config.colors)) {
      throw new Error("Wähle für jede Position eine gültige Farbe.");
    }
    if (!config.repetitions && new Set(code).size !== code.length) {
      throw new Error("In diesem Spiel darf jede Farbe nur einmal vorkommen.");
    }
  }

  function scoreGuess(code, guess) {
    if (!Array.isArray(code) || !Array.isArray(guess) || code.length !== guess.length || !code.length ||
        [...code, ...guess].some(color => !Number.isInteger(color) || color < 1)) {
      throw new Error("Code und Guess müssen gleich lange Folgen gültiger Farbnummern sein.");
    }
    let black = 0;
    const codeCounts = new Map();
    const guessCounts = new Map();
    code.forEach((color, index) => {
      if (color === guess[index]) black += 1;
      codeCounts.set(color, (codeCounts.get(color) || 0) + 1);
      guessCounts.set(guess[index], (guessCounts.get(guess[index]) || 0) + 1);
    });
    let matches = 0;
    for (const [color, count] of codeCounts) {
      matches += Math.min(count, guessCounts.get(color) || 0);
    }
    return { black, white: matches - black };
  }

  function validateFeedback(feedback, positions) {
    if (!feedback || !Number.isInteger(feedback.black) || !Number.isInteger(feedback.white) ||
        feedback.black < 0 || feedback.white < 0 || feedback.black + feedback.white > positions) {
      throw new Error(`Schwarz und Weiss müssen zusammen zwischen 0 und ${positions} liegen.`);
    }
  }

  function createGame(config) {
    validateConfig(config);
    const settings = Object.freeze({ ...config });
    const pool = Array.from({ length: settings.colors }, (_, index) => index + 1);
    const secret = Array.from({ length: settings.positions }, () => {
      const index = Math.floor(Math.random() * pool.length);
      return settings.repetitions ? pool[index] : pool.splice(index, 1)[0];
    });
    const history = [];
    let status = "playing";
    return {
      config: settings,
      get status() { return status; },
      get history() {
        return history.map(entry => ({ guess: [...entry.guess], feedback: { ...entry.feedback } }));
      },
      get revealedCode() { return status === "playing" ? null : [...secret]; },
      submit(guess) {
        if (status !== "playing") throw new Error("Das Spiel ist beendet. Starte ein neues Spiel.");
        validateCode(guess, settings);
        const feedback = scoreGuess(secret, guess);
        history.push({ guess: [...guess], feedback });
        if (feedback.black === settings.positions) status = "won";
        else if (history.length === MAX_ATTEMPTS) status = "lost";
        return { ...feedback };
      }
    };
  }

  const api = Object.freeze({ MAX_ATTEMPTS, validateConfig, validateCode, validateFeedback, scoreGuess, createGame });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Mastermind = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
