import test from 'node:test';
import assert from 'node:assert/strict';
import {AREAS, AREA_REFERENCE, areaScore, gramsFrom, gradeFor, dailyBrain, profileBrain, radarPoints} from '../academy/brain-score.js';

test('area score is 0..100 against each category reference', () => {
  assert.equal(areaScore(0, 0), 0);
  assert.equal(areaScore(0, AREA_REFERENCE[0]), 100);
  assert.equal(areaScore(1, AREA_REFERENCE[1] / 2), 50);
  assert.equal(areaScore(2, 999999), 100);
  assert.equal(areaScore(3, -5), 0);
  assert.equal(areaScore(4, 'x'), 0);
});

test('말랑그램 ranges 400g..2000g in 10g steps', () => {
  assert.equal(gramsFrom([0, 0, 0, 0, 0]), 400);
  assert.equal(gramsFrom([100, 100, 100, 100, 100]), 2000);
  assert.equal(gramsFrom([50, 50, 50, 50, 50]) % 10, 0);
  assert.equal(gradeFor(400).name, '새싹 두뇌');
  assert.equal(gradeFor(810).name, '말랑 두뇌');
  assert.equal(gradeFor(2000).name, '전설의 두뇌');
});

test('daily brain uses the five stage results in category order', () => {
  const results = AREA_REFERENCE.map((ref) => ({ score: ref }));
  const brain = dailyBrain(results);
  assert.deepEqual(brain.areas, [100, 100, 100, 100, 100]);
  assert.equal(brain.grams, 2000);
  assert.equal(dailyBrain([]).grams, 400);
});

test('profile needs all five areas and averages recent records', () => {
  const partial = profileBrain({ 0: [AREA_REFERENCE[0]], 1: [AREA_REFERENCE[1] / 2] });
  assert.equal(partial.grams, null);
  assert.equal(partial.measured, 2);
  assert.deepEqual(partial.areas.slice(0, 2), [100, 50]);
  const half = AREA_REFERENCE.map((ref) => ref / 2);
  const full = profileBrain({ 0: [half[0], half[0]], 1: { a: half[1] }, 2: [half[2]], 3: [half[3]], 4: [half[4]] });
  assert.deepEqual(full.areas, [50, 50, 50, 50, 50]);
  assert.equal(full.grams, 1200);
  assert.equal(full.grade.name, '탱글 두뇌');
});

test('radar points start at the top and go clockwise', () => {
  const [[x0, y0], [x1]] = radarPoints([100, 100, 100, 100, 100], 10, 50, 50);
  assert.ok(Math.abs(x0 - 50) < 1e-9 && Math.abs(y0 - 40) < 1e-9);
  assert.ok(x1 > 50);
  assert.equal(AREAS.length, 5);
});

test('daily reward starts at 100P and drops 5P per rank down to 20P', async () => {
  const { dailyReward } = await import('../academy/functions/domain.mjs');
  assert.equal(dailyReward(1), 100);
  assert.equal(dailyReward(2), 95);
  assert.equal(dailyReward(16), 25);
  assert.equal(dailyReward(17), 20);
  assert.equal(dailyReward(30), 20);
  assert.equal(dailyReward(undefined), 20);
});

test('every generated question stays answerable at every difficulty level', async () => {
  const { GAMES, question, isCorrect, scoreRound, roundMs } = await import('../academy/functions/domain.mjs');
  for (const game of GAMES) {
    assert.ok(roundMs(game.id) >= 30000 && roundMs(game.id) <= 45000, game.id);
    for (let i = 0; i < 40; i++) {
      const q = question(game.id, `seed-${i}`, i);
      assert.ok(isCorrect(q, q.answer), `${game.id} #${i}`);
    }
    const events = [], seed = 's';
    let at = 0;
    for (let i = 0; i < 5; i++) { const q = question(game.id, seed, i); at += Math.max(180, q.preview) + 1; events.push({ at, selected: q.answer }); }
    assert.equal(scoreRound(game.id, seed, events).correct, 5);
    assert.throws(() => scoreRound(game.id, seed, [{ at: roundMs(game.id) + 1, selected: [0] }]));
  }
});
