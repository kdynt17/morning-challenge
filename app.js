import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  serverTimestamp,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const setupRequired = firebaseConfig.apiKey.startsWith("PASTE_");

const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
const loginTab = $("#login-tab");
const signupTab = $("#signup-tab");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const logoutButton = $("#logout-button");
const authMessage = $("#auth-message");
const answerForm = $("#answer-form");
const answerInput = $("#answer");
const answerMessage = $("#answer-message");
const challengeDate = $("#challenge-date");
const challengeStatus = $("#challenge-status");
const challengeTitle = $("#challenge-title");
const challengeDescription = $("#challenge-description");
const leaderboardList = $("#leaderboard-list");
const auctionList = $("#auction-list");
const pageTitle = $("#page-title");
const todayLabel = $("#today-label");
const myPoints = $("#my-points");
const profileMessage = $("#profile-message");
const profileName = $("#profile-name");
const profileEmail = $("#profile-email");
const profilePoints = $("#profile-points");
const navButtons = document.querySelectorAll("[data-target-page]");

let auth;
let db;
let currentUser = null;
let currentChallengeId = null;

const pageNames = {
  home: "오늘의 문제",
  leaderboard: "포인트 순위",
  auction: "포인트 경매장",
  profile: "내 정보",
};

if (setupRequired) {
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  loginTab.addEventListener("click", () => setAuthMode("login"));
  signupTab.addEventListener("click", () => setAuthMode("signup"));
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
  logoutButton.addEventListener("click", () => signOut(auth));
  answerForm.addEventListener("submit", handleAnswerSubmit);

  navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      authScreen.hidden = false;
      appShell.hidden = true;
      setMessage(authMessage, "처음이면 회원가입, 이미 가입했다면 로그인하세요.");
      return;
    }

    authScreen.hidden = true;
    appShell.hidden = false;
    const profile = await loadProfile(user.uid);
    renderProfile(user, profile);
    showPage("home");
    subscribeChallenge();
    subscribeLeaderboard();
    subscribeAuctions();
  });
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  loginTab.classList.toggle("active", isLogin);
  signupTab.classList.toggle("active", !isLogin);
  setMessage(authMessage, isLogin ? "이메일과 비밀번호로 로그인하세요." : "처음 사용하는 학생은 가입하세요.");
}

async function handleLogin(event) {
  event.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const name = $("#signup-name").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await set(ref(db, `users/${credential.user.uid}`), {
      name,
      email,
      role: "student",
      points: 0,
      todayResult: "-",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

async function loadProfile(uid) {
  const snapshot = await get(ref(db, `users/${uid}`));
  return snapshot.exists() ? snapshot.val() : null;
}

function renderProfile(user, profile) {
  const name = profile?.name ?? "학생";
  const points = Number(profile?.points ?? 0);
  myPoints.textContent = points;
  profileMessage.textContent = `${name} 님, 오늘 문제를 확인해보세요.`;
  profileName.textContent = name;
  profileEmail.textContent = profile?.email ?? user.email;
  profilePoints.textContent = points;
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active-page", section.dataset.page === page);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.targetPage === page);
  });

  pageTitle.textContent = pageNames[page] ?? "아침 창의력 챌린지";
  todayLabel.textContent = getKoreaDateKey();
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
      challengeDescription.textContent = "선생님이 문제를 등록하면 자동으로 표시됩니다.";
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
  const studentsQuery = query(ref(db, "users"), orderByChild("points"), limitToLast(20));

  onValue(studentsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      leaderboardList.innerHTML = `<p class="empty-text">아직 포인트 기록이 없습니다.</p>`;
      return;
    }

    const students = [];
    snapshot.forEach((child) => students.push(child.val()));
    students.sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0));

    leaderboardList.innerHTML = students
      .map((student, index) => {
        const points = Number(student.points ?? 0);
        return `
          <article class="rank-item">
            <span class="rank-number">${index + 1}</span>
            <div>
              <p class="rank-name">${escapeHtml(student.name ?? student.email ?? "학생")}</p>
              <p class="rank-meta">${escapeHtml(student.todayResult ?? "-")}</p>
            </div>
            <span class="rank-points">${points}점</span>
          </article>
        `;
      })
      .join("");
  });
}

function subscribeAuctions() {
  const auctionsQuery = query(ref(db, "auctions"), orderByChild("endsAt"), limitToLast(12));

  onValue(auctionsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      auctionList.innerHTML = `<p class="empty-text">등록된 상품이 없습니다.</p>`;
      return;
    }

    const auctions = [];
    snapshot.forEach((child) => {
      const item = child.val();
      if (item.visible) auctions.push({ id: child.key, ...item });
    });

    if (auctions.length === 0) {
      auctionList.innerHTML = `<p class="empty-text">표시할 상품이 없습니다.</p>`;
      return;
    }

    auctions.sort((a, b) => Number(a.endsAt ?? 0) - Number(b.endsAt ?? 0));

    auctionList.innerHTML = auctions
      .map((item, index) => {
        const status = item.status === "open" ? "진행 중" : "마감";
        const currentPrice = Number(item.currentPrice ?? item.startPrice ?? 0);
        const colorClass = ["color-green", "color-blue", "color-red"][index % 3];
        return `
          <article class="auction-item">
            <div class="auction-visual ${colorClass}">${escapeHtml(item.category ?? "상품")}</div>
            <div class="auction-body">
              <p class="eyebrow">${status}</p>
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

    auctionList.querySelectorAll("button[data-auction-id]").forEach((button) => {
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
  setMessage(answerMessage, "제출됐습니다.");
}

async function handleBid(auctionId) {
  if (!currentUser) return;

  const amount = Number(prompt("입찰할 포인트를 입력하세요."));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const bidRef = push(ref(db, "bids"));
  await set(bidRef, {
    auctionId,
    uid: currentUser.uid,
    amount,
    createdAt: serverTimestamp(),
  });
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

function authErrorMessage(code) {
  if (code === "auth/email-already-in-use") return "이미 가입된 이메일입니다. 로그인으로 들어가세요.";
  if (code === "auth/invalid-email") return "이메일 형식을 확인해주세요.";
  if (code === "auth/invalid-credential") return "이메일 또는 비밀번호를 확인해주세요.";
  if (code === "auth/weak-password") return "비밀번호는 6자 이상이어야 합니다.";
  if (code === "auth/too-many-requests") return "잠시 후 다시 시도해주세요.";
  if (code === "PERMISSION_DENIED") return "데이터베이스 권한을 확인해주세요.";
  return "처리 중 문제가 생겼습니다.";
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
