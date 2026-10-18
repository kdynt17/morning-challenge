// 지뢰찾기 게임 엔진과 보드 화면. Firebase와 무관하게 동작하고, 결과는 콜백으로만 알린다.

const LONG_PRESS_MS = 420;
const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

const FLAG_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8 4h10l-3 4 3 4H8z" fill="var(--ms-flag)"/></svg>`;
const MINE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="currentColor"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="10" r="1.8" fill="#fff"/></svg>`;

export function createMinesweeper(root, callbacks = {}) {
  let config = null;
  let cells = [];
  let buttons = [];
  let state = "idle";
  let minesPlaced = false;
  let revealedCount = 0;
  let flagCount = 0;
  let startTime = 0;
  let flagMode = false;
  let pressTimer = null;
  let longPressFired = false;
  let pressedIndex = null;
  let lastPointerType = "mouse";
  let gameRunId = 0;

  root.classList.add("ms-board");
  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    // 안드로이드는 길게 누르면 contextmenu도 발생하므로, 터치에서는 롱프레스 타이머만 쓴다.
    if (lastPointerType !== "mouse") return;
    const index = getIndex(event.target);
    if (index !== null) toggleFlag(index);
  });
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("pointerup", handlePointerUp);
  root.addEventListener("pointerleave", cancelPress);
  root.addEventListener("pointercancel", cancelPress);
  // 키보드 사용자: Enter/Space로 열기, F로 깃발.
  root.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const index = getIndex(event.target);
    if (index === null) return;
    if (flagMode && !cells[index].revealed) toggleFlag(index);
    else activate(index);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "f" && event.key !== "F") return;
    const index = getIndex(event.target);
    if (index !== null) toggleFlag(index);
  });

  function start(nextConfig) {
    gameRunId += 1;
    config = { ...nextConfig };
    state = "ready";
    minesPlaced = false;
    revealedCount = 0;
    flagCount = 0;
    startTime = 0;
    cells = Array.from({ length: config.rows * config.cols }, () => ({
      mine: false,
      adjacent: 0,
      revealed: false,
      flagged: false,
    }));
    buildBoard();
    emitChange();
  }

  function buildBoard() {
    root.style.setProperty("--ms-cols", config.cols);
    root.style.setProperty("--ms-rows", config.rows);
    root.innerHTML = "";
    const fragment = document.createDocumentFragment();
    buttons = cells.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ms-cell";
      button.dataset.index = index;
      button.setAttribute("aria-label", `${Math.floor(index / config.cols) + 1}행 ${index % config.cols + 1}열, 닫힘`);
      fragment.append(button);
      return button;
    });
    root.append(fragment);
    root.classList.remove("ms-won", "ms-lost", "ms-shake");
    fitToWidth();
  }

  function fitToWidth() {
    if (!config) return;
    const available = root.parentElement?.clientWidth ?? root.clientWidth;
    const gap = 2;
    const size = Math.floor((available - 12 - gap * (config.cols - 1)) / config.cols);
    root.style.setProperty("--ms-cell", `${Math.max(18, Math.min(40, size))}px`);
  }

  function handlePointerDown(event) {
    lastPointerType = event.pointerType || "mouse";
    if (event.button !== 0) return;
    const index = getIndex(event.target);
    pressedIndex = index;
    if (index === null) return;
    longPressFired = false;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      pressTimer = setTimeout(() => {
        longPressFired = true;
        toggleFlag(index);
        navigator.vibrate?.(18);
      }, LONG_PRESS_MS);
    }
  }

  function handlePointerUp(event) {
    if (event.button !== 0) return;
    cancelPress();
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    const index = getIndex(event.target);
    // 누른 칸과 뗀 칸이 다르면(드래그) 아무것도 열지 않는다.
    if (index === null || index !== pressedIndex) return;
    pressedIndex = null;
    if (flagMode && !cells[index].revealed) toggleFlag(index);
    else activate(index);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  function getIndex(target) {
    const button = target.closest?.(".ms-cell");
    if (!button || !root.contains(button)) return null;
    return Number(button.dataset.index);
  }

  function activate(index) {
    if (state !== "ready" && state !== "playing") return;
    const cell = cells[index];
    if (cell.flagged) return;
    if (cell.revealed) {
      chord(index);
      return;
    }

    if (!minesPlaced) {
      placeMines(index);
      state = "playing";
      startTime = performance.now();
      callbacks.onStart?.();
    }

    if (cell.mine) {
      lose(index);
      return;
    }
    floodReveal(index);
    checkWin();
    emitChange();
  }

  function chord(index) {
    const cell = cells[index];
    if (!cell.adjacent) return;
    const around = neighbors(index);
    const flags = around.filter((i) => cells[i].flagged).length;
    if (flags !== cell.adjacent) return;

    const hitMine = around.find((i) => !cells[i].flagged && !cells[i].revealed && cells[i].mine);
    if (hitMine !== undefined) {
      lose(hitMine);
      return;
    }
    around.forEach((i) => {
      if (!cells[i].flagged && !cells[i].revealed) floodReveal(i);
    });
    checkWin();
    emitChange();
  }

  function toggleFlag(index) {
    if (state !== "ready" && state !== "playing") return;
    const cell = cells[index];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    paint(index);
    emitChange();
  }

  // 첫 클릭한 칸과 그 주변 8칸에는 지뢰를 두지 않아 첫 수가 항상 빈 칸으로 열린다.
  function placeMines(safeIndex) {
    const safe = new Set([safeIndex, ...neighbors(safeIndex)]);
    const candidates = cells.map((_, i) => i).filter((i) => !safe.has(i));
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    candidates.slice(0, config.mines).forEach((i) => {
      cells[i].mine = true;
    });
    cells.forEach((cell, i) => {
      cell.adjacent = neighbors(i).filter((n) => cells[n].mine).length;
    });
    minesPlaced = true;
  }

  function floodReveal(startIndex) {
    const stack = [startIndex];
    while (stack.length) {
      const index = stack.pop();
      const cell = cells[index];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      revealedCount += 1;
      paint(index);
      if (cell.adjacent === 0) {
        neighbors(index).forEach((n) => {
          if (!cells[n].revealed && !cells[n].mine) stack.push(n);
        });
      }
    }
  }

  function checkWin() {
    if (revealedCount !== cells.length - config.mines) return;
    state = "won";
    const timeMs = Math.round(performance.now() - startTime);
    cells.forEach((cell, i) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
        paint(i);
      }
    });
    flagCount = config.mines;
    root.classList.add("ms-won");
    callbacks.onWin?.({ timeMs });
  }

  // 밟은 지뢰가 먼저 터지고, 나머지 지뢰가 가까운 순서대로 드러난 뒤에 결과를 알린다.
  function lose(explodedIndex) {
    state = "lost";
    const runId = (gameRunId += 1);
    const timeMs = Math.round(performance.now() - startTime);
    cells[explodedIndex].revealed = true;
    paint(explodedIndex, true);
    root.classList.add("ms-lost");
    restartAnimation(root, "ms-shake");

    const originRow = Math.floor(explodedIndex / config.cols);
    const originCol = explodedIndex % config.cols;
    const distance = (i) => Math.hypot(Math.floor(i / config.cols) - originRow, (i % config.cols) - originCol);
    const others = cells
      .map((_, i) => i)
      .filter((i) => cells[i].mine && i !== explodedIndex)
      .sort((a, b) => distance(a) - distance(b));
    const step = others.length ? Math.min(70, 900 / others.length) : 0;
    const revealStart = 450;

    others.forEach((i, n) => {
      setTimeout(() => {
        if (runId !== gameRunId) return;
        cells[i].revealed = true;
        paint(i);
        buttons[i].classList.add("ms-pop");
      }, revealStart + n * step);
    });

    const doneAt = revealStart + others.length * step + 550;
    setTimeout(() => {
      if (runId !== gameRunId) return;
      cells.forEach((cell, i) => {
        if (cell.flagged && !cell.mine) buttons[i].classList.add("ms-wrong-flag");
      });
      emitChange();
      callbacks.onLose?.({ timeMs });
    }, doneAt);
  }

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function paint(index, exploded = false) {
    const cell = cells[index];
    const button = buttons[index];
    const position = `${Math.floor(index / config.cols) + 1}행 ${index % config.cols + 1}열`;
    button.className = "ms-cell";

    if (cell.revealed && cell.mine) {
      button.classList.add("ms-open", "ms-mine");
      if (exploded) button.classList.add("ms-exploded");
      if (cell.flagged) button.classList.add("ms-was-flagged");
      button.innerHTML = MINE_SVG;
      button.setAttribute("aria-label", `${position}, 지뢰`);
    } else if (cell.revealed) {
      button.classList.add("ms-open");
      if (cell.adjacent) button.classList.add(`ms-n${cell.adjacent}`);
      button.textContent = cell.adjacent || "";
      button.setAttribute("aria-label", `${position}, ${cell.adjacent ? `주변 지뢰 ${cell.adjacent}개` : "빈 칸"}`);
    } else if (cell.flagged) {
      button.classList.add("ms-flagged");
      button.innerHTML = FLAG_SVG;
      button.setAttribute("aria-label", `${position}, 깃발`);
    } else {
      button.textContent = "";
      button.setAttribute("aria-label", `${position}, 닫힘`);
    }
  }

  function neighbors(index) {
    const row = Math.floor(index / config.cols);
    const col = index % config.cols;
    const result = [];
    NEIGHBOR_OFFSETS.forEach(([dr, dc]) => {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < config.rows && c >= 0 && c < config.cols) result.push(r * config.cols + c);
    });
    return result;
  }

  function emitChange() {
    callbacks.onChange?.({
      state,
      minesLeft: config ? config.mines - flagCount : 0,
    });
  }

  return {
    start,
    fitToWidth,
    getElapsedMs: () => (state === "playing" ? performance.now() - startTime : 0),
    getState: () => state,
    setFlagMode(value) {
      flagMode = Boolean(value);
      root.classList.toggle("ms-flag-mode", flagMode);
    },
  };
}
