// 순간 기억: 잠깐 보이는 숫자 위치를 기억했다가 1부터 순서대로 누르기.
// 맞히면 숫자가 하나씩 늘고, 2번 틀리면 끝. 점수 = 성공한 가장 많은 숫자 개수.

import { countdown, flash, shuffle } from "./common.js";

const GRID = 5;
const START_COUNT = 3;
const LIVES = 2;

export function createMemory(root, { onFinish } = {}) {
  let count = START_COUNT;
  let bestCleared = 0;
  let lives = LIVES;
  let positions = [];
  let nextNumber = 1;
  let phase = "idle";
  let hideTimer = null;
  let startTime = 0;
  let currentRun = null;

  root.innerHTML = `
    <div class="bt-stage">
      <div class="bt-head">
        <span class="bt-chip">숫자 <b data-role="count">${START_COUNT}</b>개</span>
        <span class="bt-chip" data-role="lives"></span>
      </div>
      <p class="memory-hint" data-role="hint">숫자 위치를 기억하세요</p>
      <div class="memory-grid" data-role="grid">
        ${Array.from({ length: GRID * GRID }, (_, i) => `<button type="button" class="memory-cell" data-cell="${i}"></button>`).join("")}
      </div>
    </div>
  `;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);
  const cells = [...root.querySelectorAll(".memory-cell")];

  $("grid").addEventListener("pointerdown", (event) => {
    const cell = event.target.closest("[data-cell]");
    if (!cell) return;
    event.preventDefault();
    tap(Number(cell.dataset.cell));
  });

  function renderLives() {
    $("lives").textContent = `기회 ${"●".repeat(lives)}${"○".repeat(LIVES - lives)}`;
  }

  function newRound() {
    clearTimeout(hideTimer);
    positions = shuffle(cells.map((_, i) => i)).slice(0, count);
    nextNumber = 1;
    cells.forEach((cell) => {
      cell.className = "memory-cell";
      cell.textContent = "";
    });
    positions.forEach((cellIndex, i) => {
      cells[cellIndex].textContent = i + 1;
      cells[cellIndex].classList.add("is-shown");
    });
    $("count").textContent = count;
    $("hint").textContent = "숫자 위치를 기억하세요";
    phase = "show";
    // 보여주는 시간은 숫자가 많을수록 조금씩 길어진다. 먼저 누르면 바로 가려진다.
    hideTimer = setTimeout(hideNumbers, 700 + count * 450);
  }

  function hideNumbers() {
    if (phase !== "show") return;
    clearTimeout(hideTimer);
    positions.forEach((cellIndex) => {
      cells[cellIndex].textContent = "";
      cells[cellIndex].classList.remove("is-shown");
      cells[cellIndex].classList.add("is-hidden");
    });
    $("hint").textContent = "1부터 순서대로 누르세요";
    phase = "recall";
  }

  function tap(cellIndex) {
    if (phase === "show") hideNumbers();
    if (phase !== "recall") return;

    const expected = positions[nextNumber - 1];
    if (cellIndex === expected) {
      cells[cellIndex].classList.remove("is-hidden");
      cells[cellIndex].classList.add("is-done");
      cells[cellIndex].textContent = nextNumber;
      nextNumber += 1;
      if (nextNumber > count) {
        phase = "between";
        bestCleared = Math.max(bestCleared, count);
        $("hint").textContent = "성공! 숫자가 하나 늘어나요";
        flash($("grid"), "is-correct", 400);
        count = Math.min(GRID * GRID, count + 1);
        setTimeout(() => phase === "between" && newRound(), 750);
      }
      return;
    }

    // 틀리면 정답 위치를 보여 준다.
    phase = "between";
    lives -= 1;
    renderLives();
    cells[cellIndex].classList.add("is-miss");
    positions.forEach((pos, i) => {
      if (!cells[pos].classList.contains("is-done")) {
        cells[pos].classList.remove("is-hidden");
        cells[pos].classList.add("is-reveal");
        cells[pos].textContent = i + 1;
      }
    });
    flash($("grid"), "is-wrong", 400);
    if (lives <= 0) {
      $("hint").textContent = "끝! 정답 위치를 확인하세요";
      phase = "done";
      setTimeout(() => onFinish?.({ level: bestCleared, timeMs: Math.round(performance.now() - startTime) }), 900);
      return;
    }
    $("hint").textContent = "아쉬워요! 같은 개수로 한 번 더";
    setTimeout(() => phase === "between" && newRound(), 1300);
  }

  async function start() {
    stop();
    count = START_COUNT;
    bestCleared = 0;
    lives = LIVES;
    renderLives();
    cells.forEach((cell) => {
      cell.className = "memory-cell";
      cell.textContent = "";
    });
    const token = Symbol("run");
    currentRun = token;
    await countdown(root.querySelector(".bt-stage"));
    if (currentRun !== token) return;
    startTime = performance.now();
    newRound();
  }

  function stop() {
    phase = "idle";
    currentRun = null;
    clearTimeout(hideTimer);
  }

  return { start, stop, isRunning: () => phase !== "idle" && phase !== "done" };
}
