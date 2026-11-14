// 문제 풀이 공통 계산 (앱·테스트가 같이 쓴다). DB 규칙은 정답을 이 키 모양으로 비교한다.

export const DEFAULT_FIRST_POINTS = 100;
export const POINT_STEP = 5;
export const DEFAULT_TRIES = { choice: 1, text: 3 };
export const MAX_RAW_ANSWER = 100;
export const CHOICE_MARKS = ["①", "②", "③", "④", "⑤"];

// 학생 답과 선생님 정답을 같은 모양으로 바꾼다.
// 객관식은 보기 번호(c1~c5). 주관식은 띄어쓰기·대소문자를 무시하고,
// DB 키에 못 쓰는 글자(. $ # [ ] / %)는 %코드로 바꾼다(3.5와 35가 섞이지 않게).
export function answerKey(type, value) {
  if (type === "choice") {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? `c${n}` : "";
  }
  const text = String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, MAX_RAW_ANSWER);
  return text.replace(/[.$#[\]/%]/g, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

// 선생님이 적은 정답들(줄마다 하나)을 키 목록으로. 빈 줄은 버린다.
export function textAnswerKeys(lines) {
  return [...new Set(String(lines ?? "").split(/\n/).map((line) => answerKey("text", line)).filter(Boolean))];
}

// 맞힌 순서별 포인트: 1등 = firstPoints, 한 등수마다 5P씩 줄고, 1등 포인트의 20%(올림) 아래로는 안 내려간다.
export function pointsForRank(rank, firstPoints = DEFAULT_FIRST_POINTS) {
  const first = Math.max(0, Math.floor(Number(firstPoints) || 0));
  const floor = Math.ceil(first * 0.2);
  return Math.max(floor, first - POINT_STEP * (Math.max(1, rank) - 1));
}

// correct = { uid: { name, at } } → 먼저 맞힌 순서대로 [{ uid, name, at, rank }]
export function correctOrder(correct = {}, hidden = () => false) {
  return Object.entries(correct ?? {})
    .filter(([uid, row]) => row && !hidden(uid))
    .map(([uid, row]) => ({ uid, name: row.name, at: Number(row.at ?? 0) }))
    .sort((a, b) => a.at - b.at || a.uid.localeCompare(b.uid))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// 순위·명단에서 숨기는 테스트 계정(test1)
export const HIDDEN_UIDS = new Set(["7RyjceEPTygQef2iDZPYcKPxRwv1"]);
export const isHiddenUid = (uid) => HIDDEN_UIDS.has(uid);
