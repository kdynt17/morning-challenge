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
const claim = (db, uid, name, qid) => db.ref(`quiz/correct/${qid}/${uid}`).set({ name, at: T });

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
// 맞힌 순서는 승인된 학생 모두 볼 수 있다
assert.ok((await bob.ref("quiz/correct/q1").get()).exists());

// 주관식: 띄어쓰기 달라도 정답, 기회 2번
await attempt(bob, "bob", "q2", 1, "엽록체", "text");
await assert.rejects(claim(bob, "bob", "밥", "q2"));
await attempt(bob, "bob", "q2", 2, " 광 합성", "text");
await claim(bob, "bob", "밥", "q2");

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
await teacher.ref().update({ "quiz/questions/q1": null, "quiz/answers/q1": null, "quiz/attempts/q1": null, "quiz/correct/q1": null, "quiz/awards/q1": null });
// 예전 게임 기록은 읽기 전용
await assert.rejects(bob.ref("academy/history/bob/0").set({ 0: 5 }));
console.log("quiz rules ok");
process.exit(0);
