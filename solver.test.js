"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const helpers = require("./game.js");
const { createSolver } = require("./solver.js");
const standard = { positions: 4, colors: 6, repetitions: true };

function verifyDecisionTree(solver, config) {
  const solved = new Set();
  let maximum = 0;
  function visit(possible, guesses) {
    const guess = solver.choose(possible, guesses);
    helpers.validateCode(guess, config);
    assert.ok(!guesses.some(previous => previous.join(",") === guess.join(",")), "No repeated guesses");
    const groups = new Map();
    for (const index of possible) {
      const feedback = helpers.scoreGuess(solver.codes[index], guess);
      const key = `${feedback.black},${feedback.white}`;
      if (!groups.has(key)) groups.set(key, { feedback, indices: [] });
      groups.get(key).indices.push(index);
    }
    for (const { feedback, indices } of groups.values()) {
      assert.deepEqual(solver.filter(possible, guess, feedback), indices);
      if (feedback.black === config.positions) {
        assert.equal(indices.length, 1);
        solved.add(indices[0]);
        maximum = Math.max(maximum, guesses.length + 1);
      } else {
        assert.ok(indices.length < possible.length, "Every unsolved branch makes progress");
        visit(indices, [...guesses, guess]);
      }
    }
  }
  visit([...solver.allIndices], []);
  assert.equal(solved.size, solver.codes.length);
  return maximum;
}

test("Knuth löst alle 1296 Standardcodes in höchstens fünf Versuchen", () => {
  const solver = createSolver(standard, helpers);
  assert.equal(solver.codes.length, 1296);
  assert.deepEqual(solver.analyze([]), { count: 1296, guess: [1, 1, 2, 2] });
  assert.equal(verifyDecisionTree(solver, standard), 5);
});

test("Alle weiteren zulässigen Konfigurationen werden vollständig gelöst", () => {
  for (let positions = 2; positions <= 4; positions++) {
    for (let colors = 2; colors <= 6; colors++) {
      for (const repetitions of [true, false]) {
        const config = { positions, colors, repetitions };
        if ((!repetitions && colors < positions) || (positions === 4 && colors === 6 && repetitions)) continue;
        const solver = createSolver(config, helpers);
        const expected = repetitions ? colors ** positions
          : Array.from({ length: positions }, (_, index) => colors - index).reduce((product, value) => product * value, 1);
        assert.equal(solver.codes.length, expected);
        assert.ok(verifyDecisionTree(solver, config) <= expected);
      }
    }
  }
});

test("Minimax und Gleichstandsregeln entsprechen unabhängig berechneten Gruppengrössen", () => {
  const config = { positions: 3, colors: 3, repetitions: true };
  const solver = createSolver(config, helpers);
  for (const possible of [[...solver.allIndices], [0, 3, 7, 15, 20], [1, 2, 5, 10]]) {
    const evaluations = solver.codes.map((guess, index) => {
      const buckets = new Map();
      for (const candidate of possible) {
        const feedback = helpers.scoreGuess(solver.codes[candidate], guess);
        const key = `${feedback.black},${feedback.white}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      return { index, worst: Math.max(...buckets.values()), possible: possible.includes(index) };
    });
    evaluations.sort((a, b) => a.worst - b.worst || Number(b.possible) - Number(a.possible) || a.index - b.index);
    assert.deepEqual(solver.choose(possible), solver.codes[evaluations[0].index]);
  }
});

test("Manuelle Angaben werden validiert; Widersprüche verändern die Vorgeschichte nicht", () => {
  const config = { positions: 2, colors: 3, repetitions: true };
  const solver = createSolver(config, helpers);
  assert.throws(() => solver.analyze([{ guess: [1, 1], feedback: { black: 2, white: 1 } }]), /zusammen/);
  assert.throws(() => solver.analyze([{ guess: [1, 1], feedback: { black: -1, white: 0 } }]));
  assert.throws(() => solver.analyze([{ guess: [1, 1], feedback: { black: 1.5, white: 0 } }]));
  assert.throws(() => solver.analyze([{ guess: [1, 1], feedback: { black: 1, white: 1 } }]), /widerspricht/);
  const history = [{ guess: [1, 1], feedback: { black: 0, white: 0 } }];
  const original = JSON.stringify(history);
  assert.equal(solver.analyze(history).count, 4);
  assert.throws(() => solver.analyze([...history, { guess: [2, 2], feedback: { black: 0, white: 0 } }, { guess: [3, 3], feedback: { black: 0, white: 0 } }]), /widerspricht/);
  assert.equal(JSON.stringify(history), original);
  assert.equal(solver.analyze(history).count, 4);
  assert.deepEqual(solver.analyze([{ guess: [1, 2], feedback: { black: 2, white: 0 } }]), { count: 1, guess: null });
  assert.throws(() => createSolver({ ...config, positions: 4, repetitions: false }, helpers), /mindestens/);
});
