// 두뇌 트레이닝 게임들이 같이 쓰는 도우미.

export function countdown(container, seconds = 3) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "bt-countdown";
    container.append(overlay);
    let left = seconds;
    const tick = () => {
      if (left === 0) {
        overlay.remove();
        resolve();
        return;
      }
      overlay.innerHTML = `<span>${left}</span>`;
      left -= 1;
      setTimeout(tick, 700);
    };
    tick();
  });
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function flash(element, className, ms = 260) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), ms);
}
