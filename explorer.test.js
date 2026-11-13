"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const helpers = require("./game.js");
const { createSolver } = require("./solver.js");
const { filterSet, checkSet, partitionCodes, checkWorst, checkChoice, sortIndices, sortTable, columnDistribution, createLesson } = require("./explorer.js");
const config = { positions: 3, colors: 3, repetitions: true };

test("Analysedaten zeigen exakte Kandidaten, Gruppen und vollständige Minimax-Werte", () => {
  const solver = createSolver(config, helpers);
  const history = [{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }];
  const { guess, count, details } = solver.analyze(history, true);
  assert.equal(details.beforeIndices.length, 27);
  assert.equal(details.possibleIndices.length, count);
  assert.deepEqual(details.codes[details.recommendedIndex], guess);
  assert.equal(details.ranking.length, 26);
  assert.ok(!details.ranking.some(entry => details.codes[entry.index].join("") === "112"));
  const seen = new Set();
  for (const entry of details.ranking) {
    assert.ok(!seen.has(entry.index));
    seen.add(entry.index);
    const groups = partitionCodes(details, entry.index, helpers);
    assert.equal(groups.reduce((total, group) => total + group.count, 0), count);
    assert.deepEqual(groups.flatMap(group => group.indices).sort((a, b) => a - b), details.possibleIndices);
    assert.equal(entry.worst, Math.max(...groups.map(group => group.count)));
    assert.equal(entry.minel, count - entry.worst);
    assert.equal(entry.possible, details.possibleIndices.includes(entry.index));
    assert.deepEqual(groups.map(({ key, ...group }) => group), solver.partition(details.possibleIndices, details.codes[entry.index]));
  }
  assert.equal(details.ranking[0].index, details.recommendedIndex);
  assert.deepEqual(history, [{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }]);
});

test("Score-Filter bearbeiten die vollständige Menge statt einzelner Beispiele", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }], true);
  const universe = [...solver.allIndices];
  const kept = filterSet(details, universe, details.history, true, helpers);
  const excluded = filterSet(details, universe, details.history, false, helpers);
  assert.deepEqual(kept, details.possibleIndices);
  assert.equal(checkSet(details, kept).correct, true);
  assert.equal(checkSet(details, excluded).correct, false);
  assert.deepEqual([...kept, ...excluded].sort((a, b) => a - b), universe);
  assert.equal(checkSet(details, universe).extra.length, excluded.length);
  assert.equal(checkSet(details, []).missing.length, kept.length);
  assert.deepEqual(universe, solver.allIndices);
  assert.throws(() => filterSet(details, [99], details.history, true, helpers));
  assert.throws(() => checkSet(details, [0, 0]));
  assert.throws(() => checkSet(details, new Array(1)));
  assert.throws(() => filterSet(details, universe, details.history, "keep", helpers));
  assert.throws(() => filterSet(details, universe, [{ guess: [1, 1, 2], feedback: { black: 3, white: 1 } }], true, helpers));
});

test("Worst-Case-Aufgabe akzeptiert alle grössten Gruppen, aber keine kleineren", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([], true);
  const groups = partitionCodes(details, details.recommendedIndex, helpers);
  const worst = Math.max(...groups.map(group => group.count));
  for (const group of groups) {
    assert.equal(checkWorst(groups, group.key).correct, group.count === worst);
  }
  assert.equal(checkWorst([{ key: "a", count: 4 }, { key: "b", count: 4 }], "b").correct, true);
  assert.throws(() => checkWorst(groups, "99,99"));
});

test("Minimax-Aufgabe prüft die Auswahl einschliesslich Gleichstandsregeln", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([], true);
  for (const entry of details.ranking) {
    assert.equal(checkChoice(details, entry.index).correct, entry.index === details.recommendedIndex);
  }
  const optimum = details.ranking.find(entry => entry.index === details.recommendedIndex);
  const worse = details.ranking.find(entry => entry.worst > optimum.worst);
  assert.match(checkChoice(details, worse.index).message, /grössten Wert/);
  const tied = details.ranking.find(entry => entry.index !== optimum.index && entry.worst === optimum.worst && entry.possible === optimum.possible);
  assert.match(checkChoice(details, tied.index).message, /kleinsten Code/);
  assert.throws(() => checkChoice(details, 99));
});

test("Vier Schritte sperren spätere Aktionen und korrigieren falsche Tickboxen ohne Mengenänderung", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }], true);
  const lesson = createLesson(details);
  assert.equal(lesson.step, 1);
  assert.equal(lesson.g.size, 27);
  assert.equal(lesson.s.size, 27);
  const last = lesson.lastIndex;
  assert.throws(() => lesson.membership("g", last, undefined));
  assert.throws(() => lesson.membership("g", String(last), false));
  const wrong = (last + 1) % 27;
  assert.throws(() => lesson.membership("g", wrong, false), /nur den letzten Guess/);
  assert.equal(lesson.g.size, 27);
  assert.throws(() => lesson.membership("s", wrong, false), /erst in Schritt 2/);
  assert.throws(() => lesson.setMinel(wrong, 0), /erst nach/);
  assert.throws(() => lesson.choose(details.recommendedIndex), /zuerst/);
  lesson.membership("g", last, false);
  assert.equal(lesson.step, 2);
  assert.equal(lesson.g.size, 26);
  assert.deepEqual([...lesson.removedG], [last]);
  assert.throws(() => lesson.membership("s", details.possibleIndices[0], false), /bleibt in S/);
  assert.equal(lesson.s.size, 27);
  for (const index of [...lesson.s]) {
    if (!details.possibleIndices.includes(index)) lesson.membership("s", index, false);
  }
  assert.equal(lesson.step, 3);
  assert.deepEqual([...lesson.s], details.possibleIndices);
  assert.equal(lesson.removedS.size, 27 - details.possibleIndices.length);
  assert.equal(lesson.g.size, 26);
  assert.throws(() => lesson.membership("s", last, true), /erst in Schritt 2/);
});

test("Manuelle minel-Werte stammen aus allen vollständigen Gruppen; falsche Werte bleiben unerledigt", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }], true);
  const lesson = createLesson(details);
  lesson.automatic();
  lesson.automatic();
  const first = details.ranking[0];
  assert.throws(() => lesson.setMinel(first.index, first.minel + 1), /noch nicht korrekt/);
  assert.equal(lesson.minels.size, 0);
  assert.throws(() => lesson.setMinel(first.index, NaN));
  for (const index of lesson.g) {
    const groups = partitionCodes(details, index, helpers, [...lesson.s]);
    assert.equal(groups.reduce((sum, group) => sum + group.count, 0), lesson.s.size);
    lesson.setMinel(index, lesson.s.size - Math.max(...groups.map(group => group.count)));
  }
  assert.equal(lesson.step, 4);
  assert.equal(lesson.minels.size, lesson.g.size);
  const wrong = details.ranking.find(entry => entry.index !== details.recommendedIndex);
  assert.match(lesson.choose(wrong.index), /trotzdem übernehmen/);
  assert.equal(lesson.step, 5);
  assert.equal(lesson.choice, wrong.index);
  assert.ok(lesson.warning);
  assert.throws(() => lesson.choose(99), /gültiger Code/);
  lesson.choose(details.recommendedIndex);
  assert.equal(lesson.step, 5);
  assert.equal(lesson.choice, details.recommendedIndex);
  assert.equal(lesson.warning, "");
  assert.match(lesson.choose(lesson.lastIndex), /bereits gespielt/);
});

test("Spaltensortierung umfasst U, beide Richtungen und lässt unbekannte minel-Werte immer hinten", () => {
  const { details } = createSolver(config, helpers).analyze([], true);
  const s = new Set([0, 2]);
  const g = new Set([1, 2, 3]);
  const minels = new Map([[0, 0], [1, 4], [2, 4]]);
  const scores = details.codes.map(code => helpers.scoreGuess(code, details.codes[0]));
  const universe = details.codes.map((_, index) => index);
  assert.deepEqual(sortTable(details, "code", "asc", s, g, minels, scores), universe);
  assert.deepEqual(sortTable(details, "code", "desc", s, g, minels, scores), [...universe].reverse());
  assert.deepEqual(sortTable(details, "idx", "asc", s, g, minels, scores), universe);
  assert.deepEqual(sortTable(details, "idx", "desc", s, g, minels, scores), [...universe].reverse());
  for (const column of ["s", "g", "score", "minel"]) {
    for (const direction of ["asc", "desc"]) {
      const sorted = sortTable(details, column, direction, s, g, minels, scores);
      assert.equal(sorted.length, 27);
      assert.equal(new Set(sorted).size, 27);
      const value = index => column === "s" ? Number(s.has(index)) : column === "g" ? Number(g.has(index)) : column === "minel" ? minels.get(index) : scores[index].black * 4 + scores[index].white;
      const known = sorted.filter(index => value(index) !== undefined).map(value);
      for (let index = 1; index < known.length; index++) assert.ok(direction === "asc" ? known[index - 1] <= known[index] : known[index - 1] >= known[index]);
      if (column === "minel") assert.ok(sorted.slice(3).every(index => !minels.has(index)));
    }
  }
  assert.throws(() => sortTable(details, "unknown", "asc", s, g, minels, scores));
});

test("Spaltenverteilungen zählen alle Codes einschliesslich fehlender und nicht anwendbarer Werte", () => {
  const details = { codes: [[1], [2], [3], [4], [5]], recommendedIndex: 0 };
  const s = new Set([0, 2]);
  const g = new Set([0, 1, 2, 3]);
  const minels = new Map([[0, 0], [1, 2], [2, 2]]);
  const scores = [{ black: 1, white: 0 }, { black: 0, white: 1 }, { black: 1, white: 0 }, { black: 0, white: 0 }, { black: 0, white: 1 }];
  assert.deepEqual(columnDistribution(details, "s", s, g, minels, scores), [
    { label: "Codes in S", count: 2 }, { label: "Codes nicht in S", count: 3 }
  ]);
  assert.deepEqual(columnDistribution(details, "g", s, g, minels, scores), [
    { label: "Codes in G", count: 4 }, { label: "Codes nicht in G", count: 1 }
  ]);
  assert.deepEqual(columnDistribution(details, "score", s, g, minels, scores), [
    { label: "Score (0, 0)", count: 1 }, { label: "Score (0, 1)", count: 2 }, { label: "Score (1, 0)", count: 2 }
  ]);
  assert.deepEqual(columnDistribution(details, "score", s, g, minels, []), [{ label: "Noch kein Guess", count: 5 }]);
  assert.deepEqual(columnDistribution(details, "minel", s, g, minels, scores), [
    { label: "minel 0", count: 1 }, { label: "minel 2", count: 2 },
    { label: "Noch nicht berechnet", count: 1 }, { label: "Nicht in G", count: 1 }
  ]);
  assert.deepEqual(columnDistribution({ ...details, recommendedIndex: null }, "minel", s, g, new Map(), scores), [
    { label: "Nicht in G", count: 1 }, { label: "Nicht benötigt", count: 4 }
  ]);
  assert.throws(() => columnDistribution(details, "idx", s, g, minels, scores));
});

test("Automatik vergleicht im Standardspiel auch Testguesses ausserhalb S und lässt das Spiel unverändert", () => {
  const solver = createSolver({ positions: 4, colors: 6, repetitions: true }, helpers);
  const history = [{ guess: [1, 1, 2, 2], feedback: { black: 1, white: 1 } }];
  const { details } = solver.analyze(history, true);
  const original = JSON.stringify(details);
  const lesson = createLesson(details);
  assert.equal(lesson.automatic(), 1);
  assert.equal(lesson.g.size, 1295);
  assert.equal(lesson.automatic(), 2);
  assert.equal(lesson.s.size, 208);
  assert.equal(lesson.removedS.size, 1088);
  assert.equal(lesson.automatic(), 3);
  assert.equal(lesson.minels.size, 1295);
  assert.ok(!lesson.s.has(details.recommendedIndex), "Dieses Beispiel braucht den optimalen Testguess ausserhalb S.");
  assert.equal(lesson.automatic(), 4);
  assert.deepEqual(details.codes[lesson.choice], [1, 1, 3, 4]);
  assert.equal(lesson.step, 5);
  assert.equal(JSON.stringify(details), original);
  assert.throws(() => lesson.automatic(), /bereits erledigt/);
});

test("Vor dem ersten Guess werden leere Ausschlussschritte übersprungen; der Knuth-Start bleibt 1122", () => {
  const solver = createSolver({ positions: 4, colors: 6, repetitions: true }, helpers);
  const { details } = solver.analyze([], true);
  const lesson = createLesson(details);
  assert.equal(lesson.step, 3);
  assert.equal(lesson.lastIndex, null);
  assert.equal(lesson.s.size, 1296);
  assert.equal(lesson.g.size, 1296);
  lesson.automatic();
  lesson.automatic();
  assert.deepEqual(details.codes[lesson.choice], [1, 1, 2, 2]);
});

test("Frühere Ausschlüsse bleiben erhalten; ein wiederholter Guess wird nicht doppelt aus G entfernt", () => {
  const solver = createSolver(config, helpers);
  const entry = { guess: [1, 1, 2], feedback: { black: 1, white: 1 } };
  const { details } = solver.analyze([entry, entry], true);
  const lesson = createLesson(details);
  assert.equal(lesson.step, 3);
  assert.equal(lesson.g.size, 26);
  assert.equal(lesson.removedG.size, 0);
  assert.equal(lesson.removedS.size, 0);
  assert.deepEqual([...lesson.s], details.possibleIndices);
});

test("Nach einem Volltreffer bleiben G und S korrekt, ohne minel oder einen weiteren Guess", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 1], feedback: { black: 3, white: 0 } }], true);
  const lesson = createLesson(details);
  while (lesson.step < 5) lesson.automatic();
  assert.equal(lesson.s.size, 1);
  assert.equal(lesson.g.size, 26);
  assert.equal(lesson.minels.size, 0);
  assert.equal(lesson.choice, null);
  assert.equal(lesson.g.has(lesson.lastIndex), false);
});

test("Alle 1296 Codes bleiben in U; einzelne und kombinierte Scores erzeugen exakte Teilmengen", () => {
  const solver = createSolver({ positions: 4, colors: 6, repetitions: true }, helpers);
  const history = [
    { guess: [1, 1, 2, 2], feedback: { black: 1, white: 1 } },
    { guess: [1, 1, 3, 4], feedback: { black: 3, white: 0 } }
  ];
  const { details } = solver.analyze(history, true);
  const universe = [...solver.allIndices];
  const first = filterSet(details, universe, [history[0]], true, helpers);
  assert.equal(first.length, 208);
  const sequential = filterSet(details, first, [history[1]], true, helpers);
  const combined = filterSet(details, universe, history, true, helpers);
  assert.equal(combined.length, 2);
  assert.deepEqual(combined, sequential);
  assert.deepEqual(combined, details.possibleIndices);
  assert.equal(details.codes.length, 1296);
  assert.equal(universe.length, 1296);
  assert.deepEqual(details.history, history);
  const originalHistory = JSON.stringify(details.history);
  history[0].guess[0] = 6;
  history[0].feedback.black = 0;
  assert.equal(JSON.stringify(details.history), originalHistory);
});

test("Hypothetische Score-Gruppen enthalten alle Codes der Arbeitsmenge, auch ausserhalb des verifizierten S", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }], true);
  const universe = [...solver.allIndices];
  const groups = partitionCodes(details, 0, helpers, universe);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 27);
  assert.deepEqual(groups.flatMap(group => group.indices).sort((a, b) => a - b), universe);
  for (const group of groups) {
    const kept = filterSet(details, universe, [{ guess: details.codes[0], feedback: group }], true, helpers);
    assert.deepEqual(kept, group.indices);
    assert.equal(kept.length, group.count);
  }
  assert.deepEqual(partitionCodes(details, 0, helpers, []), []);
});

test("Sortieren verwendet die gesamte Liste und verändert keine Mengen oder Scores", () => {
  const solver = createSolver(config, helpers);
  const { details } = solver.analyze([{ guess: [1, 1, 2], feedback: { black: 1, white: 1 } }], true);
  const universe = [...solver.allIndices];
  const scores = universe.map(index => helpers.scoreGuess(details.codes[index], details.codes[0]));
  assert.deepEqual(sortIndices(details, [...universe].reverse(), "code-asc"), universe);
  assert.deepEqual(sortIndices(details, universe, "code-desc"), [...universe].reverse());
  const byScore = sortIndices(details, universe, "score", scores);
  for (let index = 1; index < byScore.length; index++) {
    const previous = scores[byScore[index - 1]];
    const current = scores[byScore[index]];
    assert.ok(previous.black * 4 + previous.white <= current.black * 4 + current.white);
  }
  const guesses = details.ranking.map(entry => entry.index);
  assert.deepEqual(sortIndices(details, [...guesses].reverse(), "minimax"), guesses);
  assert.equal(sortIndices(details, universe, "minimax").length, universe.length);
  assert.deepEqual(universe, solver.allIndices);
  assert.throws(() => sortIndices(details, universe, "unknown"));
  assert.throws(() => sortIndices(details, [], "unknown"));
  assert.throws(() => sortIndices(details, universe, "score"));
  assert.throws(() => sortIndices(details, [0], "score"));
});

test("Analyse verwendet nur öffentliche Versuche und Rückmeldungen; gelöste Codes haben keinen nächsten Vorschlag", () => {
  const solver = createSolver(config, helpers);
  const { details, guess } = solver.analyze([{ guess: [2, 1, 3], feedback: { black: 3, white: 0 } }], true);
  assert.equal(guess, null);
  assert.equal(details.recommendedIndex, null);
  assert.deepEqual(details.ranking, []);
  assert.deepEqual(details.possibleIndices.map(index => details.codes[index]), [[2, 1, 3]]);
  assert.ok(!Object.hasOwn(details, "secret"));
});

test("Standardstart und Bevorzugung möglicher Lösungen werden auch in der Übung geprüft", () => {
  const solver = createSolver({ positions: 4, colors: 6, repetitions: true }, helpers);
  const { details } = solver.analyze([], true);
  assert.equal(details.opening, true);
  assert.equal(details.codes[details.recommendedIndex].join(""), "1122");
  assert.equal(details.ranking[0].index, details.recommendedIndex);
  assert.equal(checkChoice(details, details.recommendedIndex).correct, true);
  const example = {
    codes: [[1, 1], [1, 2]],
    ranking: [
      { index: 0, worst: 2, minel: 2, possible: false },
      { index: 1, worst: 2, minel: 2, possible: true }
    ],
    recommendedIndex: 1, opening: false
  };
  assert.equal(checkChoice(example, 0).correct, false);
  assert.match(checkChoice(example, 0).message, /selbst noch in S/);
});
