import test from "node:test";
import assert from "node:assert/strict";
import { answerKey, textAnswerKeys, pointsForRank, correctOrder } from "../quiz.mjs";

test("객관식 답은 보기 번호 키", () => {
  assert.equal(answerKey("choice", 3), "c3");
  assert.equal(answerKey("choice", "1"), "c1");
  assert.equal(answerKey("choice", 0), "");
  assert.equal(answerKey("choice", 6), "");
});

test("주관식은 띄어쓰기·대소문자 무시, DB 키 금지 글자는 코드로", () => {
  assert.equal(answerKey("text", " 광합성 작용 "), "광합성작용");
  assert.equal(answerKey("text", "DNA"), answerKey("text", "d n a"));
  assert.notEqual(answerKey("text", "3.5"), answerKey("text", "35"));
  assert.doesNotMatch(answerKey("text", "a.b$c#d[e]f/g"), /[.$#[\]/]/);
  assert.equal(answerKey("text", "   "), "");
  assert.deepEqual(textAnswerKeys("광합성\n 광합성 \n\n광합성작용"), ["광합성", "광합성작용"]);
});

test("먼저 맞힐수록 포인트가 많고 최소 20%", () => {
  assert.equal(pointsForRank(1), 100);
  assert.equal(pointsForRank(2), 95);
  assert.equal(pointsForRank(16), 25);
  assert.equal(pointsForRank(30), 20);
  assert.equal(pointsForRank(1, 50), 50);
  assert.equal(pointsForRank(20, 50), 10);
  assert.equal(pointsForRank(1, 0), 0);
});

test("맞힌 순서는 서버 시각 순, 숨긴 계정 제외", () => {
  const order = correctOrder({ b: { name: "B", at: 20 }, a: { name: "A", at: 10 }, h: { name: "H", at: 1 } }, (uid) => uid === "h");
  assert.deepEqual(order.map((row) => [row.uid, row.rank]), [["a", 1], ["b", 2]]);
});
