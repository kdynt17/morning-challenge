// 간단한 효과음. 소리 파일 없이 브라우저 WebAudio로 짧게 만든다.
// 끄고 켜기는 기기마다 저장한다(mc.sound = 'off').
const KEY = 'mc.sound';
let ctx = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 저장 못 하면 이번만 */ }
}

// 음 하나: 주파수(Hz)·시작(초)·길이(초)·파형·크기
function tone(freq, at, len, type = 'sine', gain = 0.18, slideTo = null) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator(), amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t); osc.stop(t + len + 0.02);
}

const SOUNDS = {
  ok: () => { tone(880, 0, 0.09, 'triangle'); tone(1320, 0.07, 0.14, 'triangle'); },
  bad: () => { tone(200, 0, 0.22, 'square', 0.08, 130); },
  pop: () => { tone(700, 0, 0.08, 'triangle', 0.2, 180); },
  smash: () => { tone(150, 0, 0.12, 'square', 0.12, 70); tone(1800, 0, 0.05, 'triangle', 0.08); },
  tap: () => { tone(600, 0, 0.05, 'sine', 0.1); },
};

export function sfx(name) {
  if (!soundOn() || !SOUNDS[name]) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]();
  } catch { /* 소리를 못 내는 환경이면 조용히 넘어간다 */ }
}
