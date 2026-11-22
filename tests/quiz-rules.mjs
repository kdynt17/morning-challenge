// DB 에뮬레이터에서 문제 채점 규칙을 검사한다: npm run test:rules
import { initializeApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import assert from "node:assert/strict";
import { answerKey } from "../quiz.mjs";

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw Error("Emulator required");
const opts = { projectId: "demo-morning-quest", databaseURL: "https://demo-morning-quest-default-rtdb.firebaseio.com" };
const as = (name, uid, email) => getDatabase(initializeApp({ ...opts, databaseAuthVariableOverride: { uid, token: { email } } }, name));
const root = getDatabase(initializeApp(opts, "owner"));
const teacher = as("teacher", "teach", "admin@admin.com");
const bob = as("bob", "bob", "bob@test.test");
const amy = as("amy", "amy", "amy@test.test");
const eve = as("eve", "eve", "eve@test.test"); // 승인 전 학생

const T = ServerValue.TIMESTAMP;
await root.ref().set(null);
await root.ref("users").set({
  teach: { name: "선생님", email: "admin@admin", authEmail: "admin@admin.com", role: "teacher", points: 0 },
  bob: { name: "밥", email: "bob@test.test", authEmail: "bob@test.test", role: "student", status: "approved", points: 10 },
  amy: { name: "에이미", email: "amy@test.test", authEmail: "amy@test.test", role: "student", status: "approved", points: 0 },
  eve: { name: "이브", email: "eve@test.test", authEmail: "eve@test.test", role: "student", status: "pending", points: 0 },
});
const question = (extra) => ({ title: "", author: "", text: "1+1?", imageUrl: "", type: "choice", choices: ["1", "2", "3"], firstPoints: 100, maxTries: 1, open: true, createdAt: T, ...extra });

// 선생님만 문제·정답을 올린다
await assert.rejects(bob.ref("quiz/questions/q1").set(question()));
await teacher.ref().update({ "quiz/questions/q1": question(), "quiz/answers/q1": { keys: { [answerKey("choice", 2)]: true }, display: "② 2" } });
await teacher.ref().update({ "quiz/questions/q2": question({ type: "text", choices: null, maxTries: 2 }), "quiz/answers/q2": { keys: { [answerKey("text", "광합성")]: true }, display: "광합성" } });
// 학생은 정답을 읽을 수 없고 문제는 읽을 수 있다. 승인 전 학생은 못 읽는다.
await assert.rejects(bob.ref("quiz/answers").get());
await assert.rejects(bob.ref("quiz/answers/q1").get());
assert.equal((await bob.ref("quiz/questions/q1/text").get()).val(), "1+1?");
await assert.rejects(eve.ref("quiz/questions").get());

const attempt = (db, uid, qid, count, raw, type = "choice") => db.ref(`quiz/attempts/${qid}/${uid}`).set({ name: "x", count, last: answerKey(type, raw), raw: String(raw), at: T });
// 정답 등록은 번호표(quiz/counters)를 1 올리면서 같은 등수를 내 기록에 적는 한 번의 쓰기
const claim = async (db, uid, name, qid, forceRank) => {
  const rank = forceRank ?? Number((await root.ref(`quiz/counters/${qid}`).get()).val() ?? 0) + 1;
  return db.ref().update({ [`quiz/correct/${qid}/${uid}`]: { name, at: T, rank }, [`quiz/counters/${qid}`]: rank });
};

// 객관식: 틀리면 맞혔다고 쓸 수 없고, 기회 1번이라 다시 낼 수 없다
await attempt(bob, "bob", "q1", 1, 3);
await assert.rejects(claim(bob, "bob", "밥", "q1"));
await assert.rejects(attempt(bob, "bob", "q1", 2, 2));
// 횟수를 건너뛸 수 없다
await assert.rejects(attempt(amy, "amy", "q1", 2, 2));
// 맞히면 기록된다. 이름을 속이거나 두 번 쓸 수 없다
await attempt(amy, "amy", "q1", 1, 2);
await assert.rejects(claim(amy, "amy", "밥", "q1"));
await claim(amy, "amy", "에이미", "q1");
await assert.rejects(claim(amy, "amy", "에이미", "q1"));
await assert.rejects(claim(bob, "amy", "에이미", "q2"));
// 맞힌 뒤에는 답을 더 낼 수 없다
await assert.rejects(attempt(amy, "amy", "q1", 2, 1));
// 포인트 기록: 맞힌 사람만, 1등 포인트 이하, 지급 표시는 false → true 한 번
await assert.rejects(bob.ref("quiz/awards/q1/bob").set({ rank: 1, points: 100, paid: false }));
await assert.rejects(amy.ref("quiz/awards/q1/amy").set({ rank: 1, points: 101, paid: false }));
await assert.rejects(amy.ref("quiz/awards/q1/amy").set({ rank: 1, points: 100, paid: true }));
await amy.ref("quiz/awards/q1/amy").set({ rank: 1, points: 100, paid: false, at: T });
await assert.rejects(amy.ref("quiz/awards/q1/amy").set({ rank: 1, points: 50, paid: true }));
await amy.ref("quiz/awards/q1/amy").update({ paid: true });
await assert.rejects(amy.ref("quiz/awards/q1/amy").update({ paid: false }));
// 정답자 명단은 선생님만, 학생은 자기 기록만 읽는다(누가 몇 등인지 안 보임)
await assert.rejects(bob.ref("quiz/correct/q1").get());
await assert.rejects(bob.ref("quiz/correct/q1/amy").get());
assert.equal((await amy.ref("quiz/correct/q1/amy/rank").get()).val(), 1);
assert.ok((await teacher.ref("quiz/correct/q1").get()).exists());
// 등수는 번호표 +1 만: 건너뛰거나 같은 등수를 또 쓰면 거절
assert.equal((await amy.ref("quiz/counters/q1").get()).val(), 1);

// 주관식: 띄어쓰기 달라도 정답, 기회 2번
await attempt(bob, "bob", "q2", 1, "엽록체", "text");
await assert.rejects(claim(bob, "bob", "밥", "q2"));
await attempt(bob, "bob", "q2", 2, " 광 합성", "text");
await assert.rejects(claim(bob, "bob", "밥", "q2", 3));
await claim(bob, "bob", "밥", "q2");
assert.equal((await bob.ref("quiz/correct/q2/bob/rank").get()).val(), 1);
// 포인트 기록의 등수는 내 정답 기록의 등수와 같아야 한다
await assert.rejects(bob.ref("quiz/awards/q2/bob").set({ rank: 2, points: 50, paid: false }));
await bob.ref("quiz/awards/q2/bob").set({ rank: 1, points: 100, paid: false });

// 잠금·마감 중에는 답을 낼 수 없다
await teacher.ref().update({ "quiz/questions/q3": question(), "quiz/answers/q3": { keys: { c1: true }, display: "① 1" } });
await teacher.ref("settings/gamesLocked").set(true);
await assert.rejects(attempt(bob, "bob", "q3", 1, 1));
await teacher.ref("settings/gamesLocked").set(false);
await teacher.ref("quiz/questions/q3/open").set(false);
await assert.rejects(attempt(bob, "bob", "q3", 1, 1));
await teacher.ref("quiz/questions/q3/open").set(true);
// 승인 전 학생은 답을 낼 수 없다
await assert.rejects(attempt(eve, "eve", "q3", 1, 1));
await attempt(bob, "bob", "q3", 1, 1);
// 학생은 남의 시도 기록을 읽을 수 없고, 선생님은 읽는다
await assert.rejects(bob.ref("quiz/attempts/q3/amy").get());
await assert.rejects(bob.ref("quiz/attempts/q3").get());
assert.ok((await teacher.ref("quiz/attempts/q3").get()).exists());
// 선생님은 문제와 기록을 한꺼번에 지울 수 있다
await teacher.ref().update({ "quiz/questions/q1": null, "quiz/answers/q1": null, "quiz/attempts/q1": null, "quiz/correct/q1": null, "quiz/counters/q1": null, "quiz/awards/q1": null });
// 새 가입은 인증된 학교 구글 계정(@junghwa.sen.ms.kr)만
const asToken = (name, uid, token) => getDatabase(initializeApp({ ...opts, databaseAuthVariableOverride: { uid, token } }, name));
const profile = (email) => ({ name: "새 학생", email, authEmail: email, role: "student", status: "pending", points: 0, todayResult: "-", loginProvider: "google" });
const school = "202620599@junghwa.sen.ms.kr";
await asToken("g1", "g1", { email: school, email_verified: true }).ref("users/g1").set(profile(school));
await assert.rejects(asToken("g2", "g2", { email: "kid@gmail.com", email_verified: true }).ref("users/g2").set(profile("kid@gmail.com")));
await assert.rejects(asToken("g3", "g3", { email: "202620598@junghwa.sem.ms.kr", email_verified: true }).ref("users/g3").set(profile("202620598@junghwa.sem.ms.kr")));
await assert.rejects(asToken("g4", "g4", { email: "x@junghwa.sen.ms.kr.evil.com", email_verified: true }).ref("users/g4").set(profile("x@junghwa.sen.ms.kr.evil.com")));
await assert.rejects(asToken("g5", "g5", { email: "202620597@junghwa.sen.ms.kr", email_verified: false }).ref("users/g5").set(profile("202620597@junghwa.sen.ms.kr")));
// 학생은 스스로 승인하거나 연결 상태로 바꿀 수 없고, 선생님은 '연결됨'으로 바꿀 수 있다
const g1 = getDatabase(initializeApp({ ...opts, databaseAuthVariableOverride: { uid: "g1", token: { email: school, email_verified: true } } }, "g1b"));
await assert.rejects(g1.ref("users/g1/status").set("approved"));
await teacher.ref().update({ "users/g1/status": "linked", "users/g1/linkedTo": "bob", "users/bob/googleEmail": school });
// 신고: 승인된 학생만, 자기 이름·서버 시각으로만 쓰고, 읽기·처리는 선생님만
const report = (extra) => ({ uid: "bob", name: "밥", type: "abuse", speakers: ["에이미"], targets: ["나", "주변 사람들"], date: "2026-11-16", when: "쉬는 시간", where: "우리 반 교실", kinds: ["욕설"], text: "지나가면서 욕했어요", feelings: ["화가 났다"], level: 4, responses: ["자리를 피했다"], createdAt: T, ...extra });
await bob.ref("reports/r1").set(report());
await bob.ref("reports/r2").set({ uid: "bob", name: "밥", type: "intrusion", createdAt: T });
await bob.ref("reports/r1b").set({ uid: "bob", name: "밥", type: "abuse", people: ["에이미", "이브"], date: "2026-11-16", text: "점심시간에 에이미가 이브에게 욕했어요", createdAt: T });
await assert.rejects(bob.ref("reports/r3").set(report({ name: "에이미" })));
await assert.rejects(bob.ref("reports/r4").set(report({ uid: "amy" })));
await assert.rejects(bob.ref("reports/r5").set(report({ createdAt: Date.now() - 600000 })));
await assert.rejects(bob.ref("reports/r6").set(report({ type: "other" })));
await assert.rejects(bob.ref("reports/r7").set(report({ level: 9 })));
await assert.rejects(bob.ref("reports/r7b").set(report({ date: "어제" })));
await assert.rejects(bob.ref("reports/r7c").set(report({ speakers: ["가".repeat(31)] })));
await assert.rejects(bob.ref("reports/r8").set(report({ status: "done" })));
await assert.rejects(bob.ref("reports/r9").set(report({ secret: "x" })));
await assert.rejects(eve.ref("reports/r10").set({ uid: "eve", name: "이브", type: "intrusion", createdAt: T }));
await assert.rejects(bob.ref("reports/r1/text").set("고쳐 쓰기"));
await assert.rejects(bob.ref("reports").get());
await assert.rejects(bob.ref("reports/r1").get());
assert.equal((await teacher.ref("reports").get()).numChildren(), 3);
await teacher.ref("reports/r1").update({ status: "done", doneAt: Date.now() });
await assert.rejects(teacher.ref("reports/r1").update({ type: "intrusion" }));
await teacher.ref("reports/r2").remove();
// 명단: 승인된 학생만 읽고 선생님만 고친다
await assert.rejects(bob.ref("roster").set({ "20501": "가짜" }));
await teacher.ref("roster").set({ "20501": "강재준", "20502": "김다진" });
assert.equal((await bob.ref("roster/20502").get()).val(), "김다진");
await assert.rejects(eve.ref("roster").get());
await assert.rejects(teacher.ref("roster").set({ "abc": "이름" }));
// 신고 항목·알림 주소는 선생님만 정하고, 학생은 읽기만
await assert.rejects(bob.ref("settings/reportCategories").set(["욕"]));
await teacher.ref("settings/reportCategories").set(["외모 놀리기", "부모님 욕"]);
assert.equal((await bob.ref("settings/reportCategories/1").get()).val(), "부모님 욕");
await assert.rejects(teacher.ref("settings/alertTopic").set("짧음"));
await teacher.ref("settings/alertTopic").set("mc25-0123456789abcdef01234567");
await assert.rejects(bob.ref("settings/alertTopic").set("mc25-hackhackhackhackhack"));
// 예전 게임 기록은 읽기 전용
await assert.rejects(bob.ref("academy/history/bob/0").set({ 0: 5 }));
console.log("quiz rules ok");
process.exit(0);
