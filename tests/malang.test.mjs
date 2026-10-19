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
    assert.ok(roundMs(game.id) >= 20000 && roundMs(game.id) <= 45000, game.id);
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

test('new games: merged memory grows, sequence speeds up, tetris blocks fall, calc takes digits, view arrow order', async () => {
  const { GAMES, question, isCorrect, blockHeights, areaPoints, roundMs } = await import('../academy/functions/domain.mjs');
  assert.equal(GAMES.length, 15);
  assert.ok(GAMES.some((g) => g.id === 'stroop') && GAMES.some((g) => g.id === 'calc'));
  assert.equal(question('mole', 's', 0).choices.length, 3);
  assert.equal(question('mole', 's', 30).choices.length, 12);
  assert.equal(roundMs('focus'), 20000);
  assert.equal(roundMs('ladder'), 30000);
  assert.equal(question('memory', 's', 0).size, 3);
  assert.equal(question('memory', 's', 8).size, 4);
  assert.equal(question('memory', 's', 15).size, 5);
  assert.ok(question('sequence', 's', 15).flash < question('sequence', 's', 0).flash);
  assert.equal(question('balance', 's', 0).choices.length, 2);
  assert.equal(question('ladder', 's', 0).lines.length, 1);
  assert.ok(question('balloons', 's', 0).choices.every((c) => /^[1-9]$/.test(c)));
  const calc = question('calc', 's', 12);
  assert.ok(isCorrect(calc, calc.answer));
  assert.equal(isCorrect({ ...calc }, calc.answer.slice(0, -1)), false);
  const b = question('blocks', 's', 9);
  assert.deepEqual(blockHeights(b, b.answer), b.target);
  assert.equal(isCorrect(b, []), false);
  // 오른쪽에서 보면 y가 큰 줄이 왼쪽에 온다.
  const v = { ...question('view', 's', 0) };
  for (let i = 0; i < 20; i++) {
    const q = question('view', `v${i}`, 0);
    const col = (k) => Math.max(...[0, 1, 2].map((j) => q.heights[q.direction ? k * 3 + j : j * 3 + k]));
    const seen = q.direction ? [col(2), col(1), col(0)] : [col(0), col(1), col(2)];
    assert.deepEqual(q.projections[q.answer[0]], seen);
  }
  assert.ok(v);
  assert.equal(areaPoints('focus', 1000), 2000);
  assert.equal(areaPoints('memory', 900), 800);
});

test('wrong answers cost points, keep the level, and calc repeats the same problem', async () => {
  const { question, scoreRound, WRONG_PENALTY, WRONG_COOLDOWN } = await import('../academy/functions/domain.mjs');
  const seed = 'w', wrongPick = (q) => (q.type === 'digits' ? [...q.answer, 0] : q.answer.length === 1 ? [(q.answer[0] + 1) % q.choices.length] : [...q.answer].reverse());
  // 정답 2개 → 오답 1개: 200+5 = 205 → 125
  const qs = [question('mole', seed, 0, 0), question('mole', seed, 1, 1)];
  const third = question('mole', seed, 2, 2);
  const events = [{ at: 1000, selected: qs[0].answer }, { at: 2000, selected: qs[1].answer }, { at: 3000, selected: wrongPick(third) }];
  const r = scoreRound('mole', seed, events);
  assert.deepEqual([r.score, r.correct, r.wrong], [205 - WRONG_PENALTY, 2, 1]);
  // 틀린 뒤에는 0.7초 기다려야 하고, 0점 아래로는 안 내려간다.
  assert.throws(() => scoreRound('mole', seed, [{ at: 1000, selected: wrongPick(qs[0]) }, { at: 1000 + WRONG_COOLDOWN - 1, selected: [0] }]));
  assert.equal(scoreRound('mole', seed, [{ at: 1000, selected: wrongPick(qs[0]) }]).score, 0);
  // 아무거나 막 눌러도 단계가 오르지 않는다(틀리면 같은 단계의 문제).
  assert.equal(question('mole', seed, 5, 0).choices.length, 3);
  // 계산은 틀리면 같은 문제
  assert.equal(question('calc', seed, 0, 4).prompt, question('calc', seed, 1, 4).prompt);
});
