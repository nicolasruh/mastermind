"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreGuess, validateConfig, validateCode, createGame } = require("./game.js");
const standard = { positions: 4, colors: 6, repetitions: true };

test("Bewertung: exakte Treffer, verschobene Farben und Wiederholungen", () => {
  const cases = [
    [[1, 2, 3, 4], [1, 2, 3, 4], { black: 4, white: 0 }],
    [[1, 2, 3, 4], [4, 3, 2, 1], { black: 0, white: 4 }],
    [[1, 1, 2, 2], [1, 2, 1, 1], { black: 1, white: 2 }],
    [[1, 2, 3, 4], [1, 1, 1, 1], { black: 1, white: 0 }],
    [[1, 1, 2, 3], [2, 2, 4, 4], { black: 0, white: 1 }],
    [[1, 1], [2, 2], { black: 0, white: 0 }]
  ];
  for (const [code, guess, expected] of cases) {
    const original = [...code];
    assert.deepEqual(scoreGuess(code, guess), expected);
    assert.deepEqual(code, original);
    assert.deepEqual(scoreGuess(guess, code), expected);
  }
});

test("Bewertung stimmt für alle Paare mit vier Positionen und drei Farben", () => {
  const codes = Array.from({ length: 81 }, (_, number) =>
    Array.from({ length: 4 }, (_, position) => Math.floor(number / 3 ** position) % 3 + 1));
  for (const code of codes) {
    for (const guess of codes) {
      const unmatchedCode = [];
      const unmatchedGuess = [];
      let black = 0;
      code.forEach((color, index) => {
        if (color === guess[index]) black++;
        else { unmatchedCode.push(color); unmatchedGuess.push(guess[index]); }
      });
      let white = 0;
      for (const color of unmatchedGuess) {
        const index = unmatchedCode.indexOf(color);
        if (index !== -1) { white++; unmatchedCode.splice(index, 1); }
      }
      assert.deepEqual(scoreGuess(code, guess), { black, white });
    }
  }
});

test("Ungültige Einstellungen und Versuche werden abgewiesen", () => {
  assert.throws(() => validateConfig({ ...standard, positions: 5 }));
  assert.throws(() => validateConfig({ ...standard, colors: 1 }));
  assert.throws(() => validateConfig({ ...standard, colors: 3, repetitions: false }), /mindestens/);
  assert.throws(() => validateCode([1, 1, 2, 3], { ...standard, repetitions: false }), /einmal/);
  assert.throws(() => validateCode([1, 2, 3, 7], standard));
  assert.throws(() => validateCode(new Array(4), standard));
  assert.throws(() => scoreGuess([1, 2], [1]));
  assert.throws(() => scoreGuess([1, 2], [0, 2]));
});

test("Acht Fehlversuche beenden das Spiel; ungültige zählen nicht", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const game = createGame(standard);
    assert.equal(game.revealedCode, null);
    assert.throws(() => game.submit([7, 7, 7, 7]));
    assert.equal(game.history.length, 0);
    for (let attempt = 0; attempt < 7; attempt++) {
      game.submit([2, 2, 2, 2]);
      assert.equal(game.status, "playing");
    }
    game.submit([2, 2, 2, 2]);
    assert.equal(game.status, "lost");
    assert.deepEqual(game.revealedCode, [1, 1, 1, 1]);
    assert.throws(() => game.submit([1, 1, 1, 1]), /beendet/);
    assert.equal(game.history.length, 8);
  } finally { Math.random = originalRandom; }
});

test("Sieg auch im achten Versuch; Spielzustand bleibt gekapselt", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const config = { ...standard };
    const game = createGame(config);
    config.positions = 2;
    for (let attempt = 0; attempt < 7; attempt++) game.submit([2, 2, 2, 2]);
    const guess = [1, 1, 1, 1];
    game.submit(guess);
    guess[0] = 6;
    game.history[0].guess[0] = 6;
    game.revealedCode[0] = 6;
    assert.equal(game.status, "won");
    assert.equal(game.config.positions, 4);
    assert.deepEqual(game.history[7].guess, [1, 1, 1, 1]);
    assert.deepEqual(game.history[0].guess, [2, 2, 2, 2]);
    assert.deepEqual(game.revealedCode, [1, 1, 1, 1]);
    assert.throws(() => game.submit([1, 1, 1, 1]));
  } finally { Math.random = originalRandom; }
});

test("Zufallscodes sind in allen zulässigen Konfigurationen gültig; Neustart ist leer", () => {
  for (let positions = 2; positions <= 4; positions++) {
    for (let colors = 2; colors <= 6; colors++) {
      for (const repetitions of [true, false]) {
        if (!repetitions && colors < positions) continue;
        const config = { positions, colors, repetitions };
        for (let run = 0; run < 20; run++) {
          const game = createGame(config);
          assert.equal(game.history.length, 0);
          const guess = Array.from({ length: positions }, (_, index) => repetitions ? 1 : index + 1);
          while (game.status === "playing") game.submit(guess);
          validateCode(game.revealedCode, config);
        }
      }
    }
  }
});
