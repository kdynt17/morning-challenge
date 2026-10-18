// 계산 20: 쉬운 계산 20문제를 최대한 빨리. 틀리면 문제당 5초 추가.

import { countdown, flash, randomInt } from "./common.js";

export const CALC_TOTAL = 20;
export const CALC_PENALTY_MS = 5000;

function makeProblem() {
  const type = randomInt(0, 2);
  if (type === 0) {
    const a = randomInt(2, 19);
    const b = randomInt(2, 9);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (type === 1) {
    const a = randomInt(6, 25);
    const b = randomInt(2, Math.min(9, a));
    return { text: `${a} − ${b}`, answer: a - b };
  }
  const a = randomInt(2, 9);
  const b = randomInt(2, 9);
  return { text: `${a} × ${b}`, answer: a * b };
}

export function createCalc20(root, { onFinish } = {}) {
  let problems = [];
  let index = 0;
  let input = "";
  let wrong = 0;
  let results = [];
  let startTime = 0;
  let timerHandle = null;
  let running = false;

  root.innerHTML = `
    <div class="bt-stage">
      <div class="bt-head">
        <span class="bt-chip"><b data-role="progress">0</b> / ${CALC_TOTAL}</span>
        <span class="bt-chip bt-timer" data-role="timer">0.0</span>
      </div>
      <div class="calc-track">
        <p class="calc-prev" data-role="prev">&nbsp;</p>
        <p class="calc-current"><span data-role="question">준비</span><span class="calc-eq">=</span><span class="calc-answer" data-role="answer"></span></p>
        <p class="calc-next" data-role="next">&nbsp;</p>
      </div>
      <div class="numpad" data-role="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-key="${n}">${n}</button>`).join("")}
        <button type="button" data-key="clear" class="numpad-sub">지우기</button>
        <button type="button" data-key="0">0</button>
        <button type="button" data-key="back" class="numpad-sub" aria-label="한 글자 지우기">←</button>
      </div>
    </div>
  `;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);
  const answerBox = $("answer");

  $("pad").addEventListener("pointerdown", (event) => {
    const key = event.target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    event.preventDefault();
    press(key);
  });

  function onKeydown(event) {
    if (!running || !root.isConnected || root.closest("[hidden], .page:not(.active-page)")) return;
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === "Backspace") press("back");
  }
  document.addEventListener("keydown", onKeydown);

  function press(key) {
    if (!running) return;
    if (key === "clear") input = "";
    else if (key === "back") input = input.slice(0, -1);
    else if (input.length < 3) input += key;
    answerBox.textContent = input;
    const answer = String(problems[index].answer);
    if (input.length >= answer.length) judge(input === answer);
  }

  function judge(correct) {
    results.push(correct);
    if (!correct) wrong += 1;
    const done = problems[index];
    $("prev").innerHTML = `${done.text} = ${done.answer} <span class="${correct ? "mark-ok" : "mark-bad"}">${correct ? "○" : "✕"}</span>`;
    flash(root.querySelector(".calc-current"), correct ? "is-correct" : "is-wrong");
    index += 1;
    input = "";
    answerBox.textContent = "";
    if (index >= CALC_TOTAL) {
      finish();
      return;
    }
    render();
  }

  function render() {
    $("progress").textContent = index + 1;
    $("question").textContent = problems[index].text;
    $("next").textContent = problems[index + 1] ? `${problems[index + 1].text} =` : " ";
  }

  function finish() {
    running = false;
    clearInterval(timerHandle);
    const timeMs = Math.round(performance.now() - startTime);
    const adjustedMs = timeMs + wrong * CALC_PENALTY_MS;
    $("timer").textContent = (timeMs / 1000).toFixed(1);
    onFinish?.({ timeMs, wrong, adjustedMs, correct: CALC_TOTAL - wrong });
  }

  async function start() {
    stop();
    problems = Array.from({ length: CALC_TOTAL }, makeProblem);
    index = 0;
    input = "";
    wrong = 0;
    results = [];
    $("prev").innerHTML = "&nbsp;";
    $("question").textContent = "준비";
    $("next").textContent = " ";
    answerBox.textContent = "";
    $("progress").textContent = 0;
    $("timer").textContent = "0.0";
    const token = Symbol("run");
    currentRun = token;
    await countdown(root.querySelector(".bt-stage"));
    if (currentRun !== token) return;
    running = true;
    startTime = performance.now();
    timerHandle = setInterval(() => {
      $("timer").textContent = ((performance.now() - startTime) / 1000).toFixed(1);
    }, 100);
    render();
  }

  let currentRun = null;

  function stop() {
    running = false;
    currentRun = null;
    clearInterval(timerHandle);
  }

  return { start, stop, isRunning: () => running };
}
