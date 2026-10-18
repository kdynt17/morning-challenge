// 두뇌 지수(BQ), 영역 점수, 등급, 레벨 계산. Firebase와 무관한 순수 함수만 둔다.

export const AREAS = {
  calc: { label: "계산력", game: "계산 20" },
  memory: { label: "기억력", game: "순간 기억" },
  focus: { label: "집중력", game: "색깔 판단" },
  logic: { label: "추리력", game: "지뢰찾기" },
};
export const AREA_KEYS = Object.keys(AREAS);

const RECENT_LIMIT = 10;
const TOP_COUNT = 3;

export const GRADES = [
  { min: 145, name: "레전드" },
  { min: 130, name: "마스터" },
  { min: 115, name: "에이스" },
  { min: 100, name: "브레인" },
  { min: 85, name: "스파크" },
  { min: 0, name: "워밍업" },
];

// 빠를수록 좋은 기록을 0~100점으로 바꾼다. best 이하면 100점, worst 이상이면 0점.
function scaleFaster(value, best, worst) {
  const ratio = (worst - value) / (worst - best);
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

export function scoreCalc(adjustedMs) {
  return scaleFaster(adjustedMs / 1000, 20, 110);
}

export function scoreFocus(adjustedMs) {
  return scaleFaster(adjustedMs / 1000, 18, 60);
}

export function scoreMemory(level) {
  return Math.round(Math.max(0, Math.min(1, (level - 2) / 10)) * 100);
}

// 지뢰찾기는 어려운 난이도일수록 최고점 상한이 높다.
export function scoreLogic(difficulty, timeMs) {
  const seconds = timeMs / 1000;
  if (difficulty === "beginner") return Math.round(scaleFaster(seconds, 8, 90) * 0.7);
  if (difficulty === "intermediate") return Math.round(scaleFaster(seconds, 35, 300) * 0.9);
  return scaleFaster(seconds, 110, 900);
}

// 최근 10판 중 잘한 3판의 평균 = 지금 실력. 한 번 운 좋게 잘한 기록보다 꾸준한 실력을 본다.
export function areaScore(recent) {
  const scores = (recent ?? []).map(Number).filter(Number.isFinite);
  if (!scores.length) return null;
  const top = [...scores].sort((a, b) => b - a).slice(0, TOP_COUNT);
  return Math.round(top.reduce((sum, value) => sum + value, 0) / top.length);
}

export function pushRecent(recent, score) {
  return [...(recent ?? []), score].slice(-RECENT_LIMIT);
}

export function computeBrain(areas) {
  const scores = Object.fromEntries(AREA_KEYS.map((key) => [key, areaScore(areas?.[key])]));
  const measured = AREA_KEYS.filter((key) => scores[key] !== null);
  if (measured.length < AREA_KEYS.length) {
    return { scores, measured: measured.length, bq: null, grade: null };
  }
  const mean = measured.reduce((sum, key) => sum + scores[key], 0) / measured.length;
  const bq = Math.round(70 + mean * 0.85);
  return { scores, measured: measured.length, bq, grade: gradeFor(bq) };
}

export function gradeFor(bq) {
  return GRADES.find((grade) => bq >= grade.min)?.name ?? "워밍업";
}

// 레벨은 실력과 별개로 꾸준히 한 만큼 오른다. Lv.n이 되려면 누적 25·(n-1)² XP.
export function levelFromXp(xp) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
  const current = 25 * (level - 1) ** 2;
  const next = 25 * level ** 2;
  return { level, current, next, progress: (xp - current) / (next - current) };
}
