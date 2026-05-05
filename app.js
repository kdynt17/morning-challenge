import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  serverTimestamp,
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const setupRequired = firebaseConfig.apiKey.startsWith("PASTE_");
const $ = (selector) => document.querySelector(selector);

const loginForm = $("#login-form");
const logoutButton = $("#logout-button");
const authMessage = $("#auth-message");
const answerForm = $("#answer-form");
const answerInput = $("#answer");
const answerMessage = $("#answer-message");
const challengeDate = $("#challenge-date");
const challengeStatus = $("#challenge-status");
const challengeTitle = $("#challenge-title");
const challengeDescription = $("#challenge-description");
const leaderboardBody = $("#leaderboard-body");
const auctionGrid = $("#auction-grid");

let auth;
let db;
let currentUser = null;
let currentChallengeId = null;

if (setupRequired) {
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
  answerForm.querySelector("button").disabled = true;
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", () => signOut(auth));
  answerForm.addEventListener("submit", handleAnswerSubmit);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    loginForm.hidden = Boolean(user);
    logoutButton.hidden = !user;

    if (!user) {
      setMessage(authMessage, "이메일과 비밀번호로 로그인하세요.");
      renderSignedOutState();
      return;
    }

    const profile = await loadProfile(user.uid);
    setMessage(authMessage, `${profile?.name ?? user.email} 님, 오늘도 반갑습니다.`);
    subscribeChallenge();
    subscribeLeaderboard();
    subscribeAuctions();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setMessage(authMessage, loginErrorMessage(error.code));
  }
}

async function loadProfile(uid) {
  const snapshot = await get(ref(db, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

function subscribeChallenge() {
  const today = getKoreaDateKey();
  const challengeRef = ref(db, `dailyChallenges/${today}`);

  onValue(challengeRef, (snapshot) => {
    if (!snapshot.exists()) {
      currentChallengeId = null;
      challengeDate.textContent = today;
      challengeStatus.textContent = "아직 공개 전";
      challengeTitle.textContent = "오늘의 문제가 아직 등록되지 않았습니다.";
      challengeDescription.textContent = "선생님이 Realtime Database에 오늘 문제를 등록하면 자동으로 표시됩니다.";
      answerForm.querySelector("button").disabled = true;
      return;
    }

    const challenge = snapshot.val();
    currentChallengeId = snapshot.key;
    challengeDate.textContent = today;
    challengeStatus.textContent = challenge.status === "open" ? "제출 가능" : "마감";
    challengeTitle.textContent = challenge.title;
    challengeDescription.textContent = challenge.description;
    answerForm.querySelector("button").disabled = challenge.status !== "open";
  });
}

function subscribeLeaderboard() {
  const studentsQuery = query(ref(db, "users"), orderByChild("points"), limitToLast(10));

  onValue(studentsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      leaderboardBody.innerHTML = `<tr><td colspan="4">아직 포인트 기록이 없습니다.</td></tr>`;
      return;
    }

    const students = [];
    snapshot.forEach((child) => students.push(child.val()));
    students.sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0));

    leaderboardBody.innerHTML = students
      .map((student, index) => {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(student.name ?? student.email ?? "학생")}</td>
            <td>${escapeHtml(student.todayResult ?? "-")}</td>
            <td>${Number(student.points ?? 0)}</td>
          </tr>
        `;
      })
      .join("");
  });
}

function subscribeAuctions() {
  const auctionsQuery = query(ref(db, "auctions"), orderByChild("endsAt"), limitToLast(12));

  onValue(auctionsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      auctionGrid.innerHTML = `
        <article class="auction-item">
          <div class="item-image color-blue">상품</div>
          <div>
            <p class="status">준비 중</p>
            <h3>등록된 상품이 없습니다.</h3>
            <p>선생님이 Realtime Database에 상품을 등록하면 여기에 표시됩니다.</p>
            <button type="button" disabled>대기 중</button>
          </div>
        </article>
      `;
      return;
    }

    const auctions = [];
    snapshot.forEach((child) => {
      const item = child.val();
      if (item.visible) auctions.push({ id: child.key, ...item });
    });

    if (auctions.length === 0) {
      auctionGrid.innerHTML = `
        <article class="auction-item">
          <div class="item-image color-blue">상품</div>
          <div>
            <p class="status">준비 중</p>
            <h3>표시할 상품이 없습니다.</h3>
            <p>visible 값을 true로 바꾸면 경매장에 표시됩니다.</p>
            <button type="button" disabled>대기 중</button>
          </div>
        </article>
      `;
      return;
    }
    auctions.sort((a, b) => Number(a.endsAt ?? 0) - Number(b.endsAt ?? 0));

    auctionGrid.innerHTML = auctions
      .map((item, index) => {
        const status = item.status === "open" ? "진행 중" : "마감";
        const currentPrice = Number(item.currentPrice ?? item.startPrice ?? 0);
        const colorClass = ["color-green", "color-blue", "color-red"][index % 3];
        return `
          <article class="auction-item">
            <div class="item-image ${colorClass}">${escapeHtml(item.category ?? "상품")}</div>
            <div>
              <p class="status">${status}</p>
              <h3>${escapeHtml(item.title ?? "상품")}</h3>
              <p>현재가 ${currentPrice}점 · ${formatDeadline(item.endsAt)}</p>
              <button type="button" data-auction-id="${item.id}" ${item.status === "open" ? "" : "disabled"}>
                입찰하기
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    auctionGrid.querySelectorAll("button[data-auction-id]").forEach((button) => {
      button.addEventListener("click", () => handleBid(button.dataset.auctionId));
    });
  });
}

async function handleAnswerSubmit(event) {
  event.preventDefault();

  if (!currentUser || !currentChallengeId) {
    setMessage(answerMessage, "로그인 후 오늘의 문제를 불러와 주세요.");
    return;
  }

  const answer = answerInput.value.trim();
  if (!answer) return;

  const submissionRef = push(ref(db, "submissions"));
  await set(submissionRef, {
    challengeId: currentChallengeId,
    uid: currentUser.uid,
    answer,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  answerInput.value = "";
  setMessage(answerMessage, "제출됐습니다. 정답 판정은 선생님 설정 또는 Cloud Functions에서 처리합니다.");
}

async function handleBid(auctionId) {
  if (!currentUser) {
    setMessage(authMessage, "입찰하려면 먼저 로그인하세요.");
    return;
  }

  const amount = Number(prompt("입찰할 포인트를 입력하세요."));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const bidRef = push(ref(db, "bids"));
  await set(bidRef, {
    auctionId,
    uid: currentUser.uid,
    amount,
    createdAt: serverTimestamp(),
  });

  setMessage(authMessage, `${amount}점 입찰을 기록했습니다.`);
}

function renderSignedOutState() {
  leaderboardBody.innerHTML = `<tr><td colspan="4">로그인 후 순위표를 불러옵니다.</td></tr>`;
  answerForm.querySelector("button").disabled = true;
}

function getKoreaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDeadline(timestamp) {
  if (!timestamp) return "마감 시간 미정";
  return new Date(Number(timestamp)).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loginErrorMessage(code) {
  if (code === "auth/invalid-credential") return "이메일 또는 비밀번호를 확인해주세요.";
  if (code === "auth/too-many-requests") return "잠시 후 다시 시도해주세요.";
  return "로그인 중 문제가 생겼습니다.";
}

function setMessage(element, message) {
  element.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
