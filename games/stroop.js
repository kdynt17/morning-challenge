// 색깔 판단(스트룹): 글자가 "무슨 색으로 칠해졌는지" 고르기. 20문제, 틀리면 3초 추가.

import { countdown, flash, randomInt, shuffle } from "./common.js";

export const STROOP_TOTAL = 20;
export const STROOP_PENALTY_MS = 3000;

const COLORS = [
  { key: "red", name: "빨강", hex: "#e2483d" },
  { key: "blue", name: "파랑", hex: "#2f5bea" },
  { key: "green", name: "초록", hex: "#12925e" },
  { key: "yellow", name: "노랑", hex: "#d49a00" },
];

function makeTrial() {
  const word = COLORS[randomInt(0, COLORS.length - 1)];
  // 대부분은 글자와 색이 다르게(헷갈리게), 가끔은 같게.
  const congruent = Math.random() < 0.25;
  const ink = congruent ? word : shuffle(COLORS.filter((c) => c.key !== word.key))[0];
  return { word, ink };
}

export function createStroop(root, { onFinish } = {}) {
  let trials = [];
  let index = 0;
  let wrong = 0;
  let startTime = 0;
  let timerHandle = null;
  let running = false;
  let currentRun = null;

  root.innerHTML = `
    <div class="bt-stage">
      <div class="bt-head">
        <span class="bt-chip"><b data-role="progress">0</b> / ${STROOP_TOTAL}</span>
        <span class="bt-chip bt-timer" data-role="timer">0.0</span>
      </div>
      <p class="stroop-hint">글자 말고 <strong>글자의 색깔</strong>을 고르세요</p>
      <p class="stroop-word" data-role="word">준비</p>
      <div class="stroop-options" data-role="options">
        ${COLORS.map((c) => `<button type="button" data-color="${c.key}" style="--swatch:${c.hex}"><span class="swatch"></span>${c.name}</button>`).join("")}
      </div>
    </div>
  `;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);

  $("options").addEventListener("pointerdown", (event) => {
    const key = event.target.closest("[data-color]")?.dataset.color;
    if (!key || !running) return;
    event.preventDefault();
    answer(key);
  });

  function onKeydown(event) {
    if (!running || root.closest(".page:not(.active-page)")) return;
    const map = { 1: "red", 2: "blue", 3: "green", 4: "yellow" };
    if (map[event.key]) answer(map[event.key]);
  }
  document.addEventListener("keydown", onKeydown);

  function answer(key) {
    const correct = key === trials[index].ink.key;
    if (!correct) wrong += 1;
    flash($("word"), correct ? "is-correct" : "is-wrong");
    index += 1;
    if (index >= STROOP_TOTAL) {
      finish();
      return;
    }
    render();
  }

  function render() {
    const trial = trials[index];
    $("progress").textContent = index + 1;
    $("word").textContent = trial.word.name;
    $("word").style.color = trial.ink.hex;
  }

  function finish() {
    running = false;
    clearInterval(timerHandle);
    const timeMs = Math.round(performance.now() - startTime);
    const adjustedMs = timeMs + wrong * STROOP_PENALTY_MS;
    $("word").textContent = "끝!";
    $("word").style.color = "";
    onFinish?.({ timeMs, wrong, adjustedMs, correct: STROOP_TOTAL - wrong });
  }

  async function start() {
    stop();
    trials = Array.from({ length: STROOP_TOTAL }, makeTrial);
    index = 0;
    wrong = 0;
    $("progress").textContent = 0;
    $("timer").textContent = "0.0";
    $("word").textContent = "준비";
    $("word").style.color = "";
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

  function stop() {
    running = false;
    currentRun = null;
    clearInterval(timerHandle);
  }

  return { start, stop, isRunning: () => running };
}
