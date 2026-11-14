// 예비용: 서비스 계정 키로 학생 비밀번호를 바꾼다.
// GOOGLE_APPLICATION_CREDENTIALS=키.json node tools/reset-password.mjs <학번 또는 이메일> <새 비밀번호>
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 6) {
  console.error("사용법: node tools/reset-password.mjs <학번 또는 이메일> <새 비밀번호(6자 이상)>");
  process.exit(1);
}
const email = /^\d+$/.test(login) ? `${login}@junghwa.sen.ms.kr` : login;
initializeApp({ credential: applicationDefault(), projectId: "morning-quest" });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.updateUser(user.uid, { password });
console.log(`${email} (${user.uid}) 비밀번호를 바꿨어요.`);
